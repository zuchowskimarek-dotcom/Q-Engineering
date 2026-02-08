import {
    Heading, Text, VStack, Box, Button, useDisclosure,
    Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton,
    ModalBody, ModalFooter, FormControl, FormLabel, Input, useToast,
    HStack, Select, InputGroup, InputLeftElement, InputRightElement,
    Tooltip, Badge, Spinner
} from '@chakra-ui/react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { FiPlus, FiFolder, FiSearch, FiCheckCircle } from 'react-icons/fi';
import { TreeView } from '../components/TreeView';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { FolderPicker } from '../components/FolderPicker';

const API_URL = 'http://localhost:3003/api';

export const Repositories = () => {
    const [repositories, setRepositories] = useState<any[]>([]);
    const { isOpen, onOpen, onClose } = useDisclosure();
    const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();
    const { isOpen: isPickerOpen, onOpen: onPickerOpen, onClose: onPickerClose } = useDisclosure();
    const [repoToDelete, setRepoToDelete] = useState<string | null>(null);
    const [editingRepo, setEditingRepo] = useState<any | null>(null);
    const [formData, setFormData] = useState({ name: '', url: '', type: 'LOCAL', remoteUrl: '' });
    const [isDraggingOverInput, setIsDraggingOverInput] = useState(false);
    const [isDetecting, setIsDetecting] = useState(false);
    const [detectedInfo, setDetectedInfo] = useState<{ type: string, remoteUrl: string | null } | null>(null);
    const detectionTimeoutRef = useRef<any>(null);

    const toast = useToast();

    const fetchRepos = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/repositories`);
            const data = await res.json();
            setRepositories(data);
        } catch (error) {
            toast({ title: 'Error fetching repositories', status: 'error' });
        }
    }, [toast]);

    useEffect(() => {
        fetchRepos();
    }, [fetchRepos]);

    // Background polling while syncing
    useEffect(() => {
        const isSyncing = repositories.some(r => r.syncStatus === 'SYNCING');
        if (isSyncing) {
            const interval = setInterval(() => {
                fetchRepos();
            }, 3000);
            return () => clearInterval(interval);
        }
    }, [repositories, fetchRepos]);

    // Handle real-time detection
    const detectRepo = async (path: string) => {
        if (!path || path.length < 3) {
            setDetectedInfo(null);
            return;
        }

        setIsDetecting(true);
        try {
            const res = await fetch(`${API_URL}/fs/detect-repo?path=${encodeURIComponent(path)}`);
            if (res.ok) {
                const info = await res.json();
                setDetectedInfo(info);
                // Auto-update form data if detecting for the first time or if it's a new repo
                if (!editingRepo) {
                    setFormData(prev => ({
                        ...prev,
                        type: info.type,
                        remoteUrl: info.remoteUrl || ''
                    }));
                }
            } else {
                setDetectedInfo(null);
            }
        } catch (e) {
            setDetectedInfo(null);
        } finally {
            setIsDetecting(false);
        }
    };

    useEffect(() => {
        if (detectionTimeoutRef.current) clearTimeout(detectionTimeoutRef.current);
        if (formData.url && !editingRepo) {
            detectionTimeoutRef.current = setTimeout(() => {
                detectRepo(formData.url);
            }, 500);
        }
        return () => clearTimeout(detectionTimeoutRef.current);
    }, [formData.url, editingRepo]);



    const handleSubmit = async () => {
        try {
            const method = editingRepo ? 'PUT' : 'POST';
            const url = editingRepo ? `${API_URL}/repositories/${editingRepo.id}` : `${API_URL}/repositories`;

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            if (!res.ok) throw new Error();

            toast({ title: `Repository ${editingRepo ? 'updated' : 'added'}`, status: 'success' });
            handleModalClose();
            fetchRepos();
        } catch (error) {
            toast({ title: `Error ${editingRepo ? 'updating' : 'adding'} repository`, status: 'error' });
        }
    };

    // Reset all modal state when closing
    const handleModalClose = () => {
        setFormData({ name: '', url: '', type: 'LOCAL', remoteUrl: '' });
        setEditingRepo(null);
        setDetectedInfo(null);
        onClose();
    };

    const handleDeleteRepo = (id: string) => {
        setRepoToDelete(id);
        onDeleteOpen();
    };

    const confirmDelete = async () => {
        if (!repoToDelete) return;
        try {
            await fetch(`${API_URL}/repositories/${repoToDelete}`, { method: 'DELETE' });
            toast({ title: 'Repository removed', status: 'success' });
            fetchRepos();
            onDeleteClose();
        } catch (error) {
            toast({ title: 'Error removing repository', status: 'error' });
        }
    };

    const handleDiscover = async (repoId: string) => {
        try {
            const res = await fetch(`${API_URL}/repositories/${repoId}/discover`, { method: 'POST' });
            if (!res.ok) throw new Error();
            fetchRepos();
            toast({ title: 'Directory scan complete', status: 'success' });
        } catch (error) {
            toast({ title: 'Discovery failed', status: 'error' });
        }
    };

    const handleSync = async (repoId: string) => {
        try {
            const res = await fetch(`${API_URL}/repositories/${repoId}/sync`, { method: 'POST' });
            if (!res.ok) throw new Error();

            // Optimistic status update
            setRepositories(prev => prev.map(r => r.id === repoId ? { ...r, syncStatus: 'SYNCING' } : r));

            toast({ title: 'Sync started', description: 'Metrics are being calculated in background', status: 'info' });
        } catch (error) {
            toast({ title: 'Sync failed to start', status: 'error' });
        }
    };

    const handleToggleProject = async (projectIds: string | string[], forceState?: boolean) => {
        const ids = Array.isArray(projectIds) ? projectIds : [projectIds];

        // Optimistic update
        setRepositories(prev => prev.map(repo => ({
            ...repo,
            projects: repo.projects.map((p: any) =>
                ids.includes(p.id) ? { ...p, isSelected: forceState !== undefined ? forceState : !p.isSelected } : p
            )
        })));

        try {
            // Determine state if not forced
            let targetState = forceState;
            if (targetState === undefined) {
                // Find current state of the first ID to toggle it
                for (const repo of repositories) {
                    const p = repo.projects.find((p: any) => p.id === ids[0]);
                    if (p) {
                        targetState = !p.isSelected;
                        break;
                    }
                }
            }

            const res = await fetch(`${API_URL}/projects/bulk-toggle`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids, isSelected: !!targetState })
            });
            if (!res.ok) throw new Error();
        } catch (error) {
            toast({ title: 'Failed to update project status', status: 'error' });
            fetchRepos();
        }
    };

    return (
        <VStack align="start" spacing={6} w="full">
            <HStack w="full" justify="space-between">
                <Box>
                    <Heading size="lg" mb={2}>Repository Management</Heading>
                    <Text color="gray.400">Manage code sources and select active subprojects for analytics.</Text>
                </Box>
                <Button leftIcon={<FiPlus />} colorScheme="brand" onClick={() => { setEditingRepo(null); setFormData({ name: '', url: '', type: 'LOCAL', remoteUrl: '' }); onOpen(); }}>
                    Add Repository
                </Button>
            </HStack>

            <Box
                w="full"
                bg="gray.800"
                borderRadius="xl"
                border="1px"
                borderColor="whiteAlpha.100"
                p={4}
                minH="500px"
            >
                <TreeView
                    repositories={repositories}
                    onToggleProject={handleToggleProject}
                    onDeleteRepo={handleDeleteRepo}
                    onEditRepo={(repo) => {
                        setEditingRepo(repo);
                        setFormData({
                            name: repo.name,
                            url: repo.url,
                            type: repo.type,
                            remoteUrl: repo.remoteUrl || ''
                        });
                        onOpen();
                    }}
                    onDiscover={handleDiscover}
                    onSync={handleSync}
                />
            </Box>

            {/* Add/Edit Repo Modal */}
            <Modal isOpen={isOpen} onClose={handleModalClose} size="2xl">
                <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(5px)" />
                <ModalContent bg="gray.800" color="white" borderColor="whiteAlpha.200" border="1px">
                    <ModalHeader>{editingRepo ? 'Edit Repository' : 'Add New Repository'}</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody pb={6}>
                        <VStack spacing={4}>
                            <FormControl isRequired>
                                <FormLabel>Local Path</FormLabel>
                                <InputGroup>
                                    <InputLeftElement pointerEvents="none">
                                        <FiFolder color="#A0AEC0" />
                                    </InputLeftElement>
                                    <Tooltip
                                        label={isDraggingOverInput ? "Drop to use folder path" : formData.url}
                                        isOpen={isDraggingOverInput || undefined}
                                        isDisabled={!formData.url && !isDraggingOverInput}
                                        placement="top"
                                        hasArrow
                                    >
                                        <Input
                                            value={formData.url}
                                            isDisabled={!!editingRepo}
                                            onChange={(e) => {
                                                let val = e.target.value;
                                                // Only strip quotes if they wrap the entire string (pasted path)
                                                if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
                                                if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);

                                                setFormData(prev => ({
                                                    ...prev,
                                                    url: val,
                                                    name: prev.name === '' || prev.name === prev.url.split(/[/\\]/).pop()
                                                        ? val.split(/[/\\]/).pop() || ''
                                                        : prev.name
                                                }));
                                            }}
                                            onBlur={() => {
                                                setFormData(prev => ({
                                                    ...prev,
                                                    url: prev.url.trim()
                                                }));
                                            }}
                                            onDragEnter={(e) => { e.preventDefault(); setIsDraggingOverInput(true); }}
                                            onDragOver={(e) => { e.preventDefault(); setIsDraggingOverInput(true); }}
                                            onDragLeave={() => setIsDraggingOverInput(false)}
                                            onDrop={(e) => {
                                                e.preventDefault();
                                                setIsDraggingOverInput(false);
                                            }}
                                            placeholder="/Users/yourname/projects/my-repo"
                                            bg={isDraggingOverInput ? "blue.900" : "gray.700"}
                                            borderColor={isDraggingOverInput ? "brand.400" : "gray.600"}
                                            borderWidth={isDraggingOverInput ? "2px" : "1px"}
                                            _hover={{ borderColor: "gray.500" }}
                                            _focus={{ borderColor: "brand.400", boxShadow: "0 0 0 1px var(--chakra-colors-brand-400)" }}
                                            pr="8.5rem"
                                            pl="2.5rem"
                                        />
                                    </Tooltip>
                                    <InputRightElement width="8.5rem" pr={2}>
                                        <HStack spacing={2} justify="flex-end" w="full">
                                            {isDetecting ? (
                                                <Spinner size="xs" color="brand.400" />
                                            ) : detectedInfo?.type !== 'LOCAL' ? (
                                                <Badge
                                                    colorScheme={detectedInfo?.type === 'GITLAB' ? 'orange' : 'purple'}
                                                    variant="subtle"
                                                    fontSize="10px"
                                                >
                                                    {detectedInfo?.type}
                                                </Badge>
                                            ) : null}
                                            <Button
                                                h="1.75rem"
                                                size="xs"
                                                variant="solid"
                                                colorScheme="gray"
                                                onClick={onPickerOpen}
                                                leftIcon={<FiSearch />}
                                                isDisabled={!!editingRepo}
                                            >
                                                Browse
                                            </Button>
                                        </HStack>
                                    </InputRightElement>
                                </InputGroup>
                                {detectedInfo?.remoteUrl && (
                                    <HStack mt={2} spacing={1}>
                                        <FiCheckCircle size={12} color="#48BB78" />
                                        <Text fontSize="xs" color="green.400" noOfLines={1}>
                                            Detected: {detectedInfo.remoteUrl}
                                        </Text>
                                    </HStack>
                                )}
                                <Text fontSize="xs" color="gray.500" mt={1}>
                                    Type or paste the full path to your local repository.
                                </Text>
                            </FormControl>


                            <FormControl isRequired>
                                <FormLabel>Display Name</FormLabel>
                                <Input
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="e.g. Q-Products"
                                />
                            </FormControl>

                            {editingRepo && (
                                <>
                                    <FormControl>
                                        <FormLabel>Detected Repo Type</FormLabel>
                                        <Select
                                            value={formData.type}
                                            onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                            bg="gray.700"
                                            borderColor="whiteAlpha.300"
                                        >
                                            <option value="LOCAL" style={{ background: '#2D3748' }}>Local Code Base</option>
                                            <option value="GITHUB" style={{ background: '#2D3748' }}>GitHub Clone</option>
                                            <option value="GITLAB" style={{ background: '#2D3748' }}>GitLab Clone</option>
                                        </Select>
                                    </FormControl>
                                    <FormControl>
                                        <FormLabel>Git Remote URL</FormLabel>
                                        <Input
                                            value={formData.remoteUrl || ''}
                                            isReadOnly
                                            variant="filled"
                                            bg="whiteAlpha.50"
                                            placeholder="No remote detected"
                                        />
                                    </FormControl>
                                </>
                            )}
                        </VStack>
                    </ModalBody>
                    <ModalFooter borderTop="1px" borderColor="whiteAlpha.100">
                        <Button variant="ghost" mr={3} onClick={handleModalClose}>Cancel</Button>
                        <Button colorScheme="brand" onClick={handleSubmit}>
                            {editingRepo ? 'Save Changes' : 'Add Repository'}
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>
            {/* Delete Confirmation */}
            <ConfirmDialog
                isOpen={isDeleteOpen}
                onClose={onDeleteClose}
                onConfirm={confirmDelete}
                title="Remove Repository"
                message="Are you sure? This will remove the repository and all its associated projects from the analytics dashboard."
            />
            {/* Folder Picker */}
            <FolderPicker
                isOpen={isPickerOpen}
                onClose={onPickerClose}
                onSelect={(path) => {
                    setFormData(prev => ({
                        ...prev,
                        url: path,
                        name: prev.name === '' || prev.name === prev.url.split(/[/\\]/).pop()
                            ? path.split(/[/\\]/).pop() || ''
                            : prev.name
                    }));
                }}
            />
        </VStack>
    );
};
