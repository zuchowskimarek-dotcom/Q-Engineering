import {
    Heading, Text, VStack, Box, Button, useDisclosure,
    Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton,
    ModalBody, ModalFooter, FormControl, FormLabel, Input, useToast,
    HStack, IconButton, Table, Thead, Tbody, Tr, Th, Td, Badge, Spinner, Center, Select
} from '@chakra-ui/react';
import { AgGridReact } from 'ag-grid-react';
import { type ColDef } from 'ag-grid-community';
import { useState, useEffect, useCallback } from 'react';
import { FiUserPlus, FiTrash2, FiEdit2, FiDownload, FiPlus } from 'react-icons/fi';
import { gridTheme } from '../theme/gridTheme';
import { ConfirmDialog } from '../components/ConfirmDialog';

const API_URL = 'http://localhost:3001/api';

export const People = () => {
    const [rowData, setRowData] = useState<any[]>([]);
    const { isOpen, onOpen, onClose } = useDisclosure();
    const { isOpen: isImportOpen, onOpen: onImportOpen, onClose: onImportClose } = useDisclosure();
    const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();

    const [personToDelete, setPersonToDelete] = useState<string | null>(null);

    const [formData, setFormData] = useState({ name: '', email: '', gitUsername: '', msId: '' });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [discoveredAuthors, setDiscoveredAuthors] = useState<any[]>([]);
    const [repositories, setRepositories] = useState<any[]>([]);
    const [selectedRepoId, setSelectedRepoId] = useState<string>('');
    const [isScanning, setIsScanning] = useState(false);

    const toast = useToast();

    const fetchPeople = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/people`);
            const data = await res.json();
            setRowData(data);
        } catch (error) {
            toast({ title: 'Error fetching people', status: 'error' });
        }
    }, [toast]);

    const fetchRepos = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/repositories`);
            const data = await res.json();
            setRepositories(data);
        } catch (error) {
            console.error('Error fetching repositories');
        }
    }, []);

    useEffect(() => {
        fetchPeople();
        fetchRepos();
    }, [fetchPeople, fetchRepos]);

    const handleScan = async () => {
        if (!selectedRepoId) {
            toast({ title: 'Please select a repository first', status: 'warning' });
            return;
        }
        setIsScanning(true);
        try {
            const res = await fetch(`${API_URL}/import/git-authors?repoId=${selectedRepoId}`);
            const data = await res.json();
            setDiscoveredAuthors(data);
            if (data.length === 0) {
                toast({ title: 'No unique authors found in this repository', status: 'info' });
            }
        } catch (error) {
            toast({ title: 'Failed to scan Git repository', status: 'error' });
        } finally {
            setIsScanning(false);
        }
    };

    const handleImport = async (author: any) => {
        try {
            const res = await fetch(`${API_URL}/people`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: author.name,
                    email: author.email,
                    gitUsername: author.email.split('@')[0]
                }),
            });

            if (!res.ok) throw new Error();

            toast({ title: `Imported ${author.name}`, status: 'success' });
            fetchPeople();
            setDiscoveredAuthors(prev => prev.filter(a => a.email !== author.email));
        } catch (error) {
            toast({ title: 'Already exists or error', status: 'error' });
        }
    };

    const handleSubmit = async () => {
        try {
            const method = editingId ? 'PUT' : 'POST';
            const url = editingId ? `${API_URL}/people/${editingId}` : `${API_URL}/people`;

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            if (!res.ok) throw new Error();

            toast({ title: `Person ${editingId ? 'updated' : 'created'}`, status: 'success' });
            onClose();
            setEditingId(null);
            setFormData({ name: '', email: '', gitUsername: '', msId: '' });
            fetchPeople();
        } catch (error) {
            toast({ title: 'Error saving person', status: 'error' });
        }
    };

    const handleDelete = (id: string) => {
        setPersonToDelete(id);
        onDeleteOpen();
    };

    const confirmDelete = async () => {
        if (!personToDelete) return;
        try {
            await fetch(`${API_URL}/people/${personToDelete}`, { method: 'DELETE' });
            toast({ title: 'Person deleted', status: 'success' });
            fetchPeople();
            onDeleteClose();
        } catch (error) {
            toast({ title: 'Error deleting person', status: 'error' });
        }
    };

    const openEdit = (person: any) => {
        setEditingId(person.id);
        setFormData({
            name: person.name,
            email: person.email || '',
            gitUsername: person.gitUsername || '',
            msId: person.msId || ''
        });
        onOpen();
    };

    const columnDefs: ColDef[] = [
        { field: 'name', headerName: 'Name', flex: 1, sortable: true, filter: true },
        { field: 'email', headerName: 'Email', flex: 1, sortable: true, filter: true },
        { field: 'gitUsername', headerName: 'Git Username', flex: 1 },
        {
            headerName: 'Teams',
            valueGetter: (params) => params.data.memberships?.map((m: any) => m.team.name).join(', '),
            flex: 1
        },
        {
            headerName: 'Actions',
            cellRenderer: (params: any) => (
                <HStack spacing={2} h="full" align="center">
                    <IconButton
                        aria-label="Edit"
                        icon={<FiEdit2 />}
                        size="sm"
                        variant="ghost"
                        onClick={() => openEdit(params.data)}
                    />
                    <IconButton
                        aria-label="Delete"
                        icon={<FiTrash2 />}
                        size="sm"
                        variant="ghost"
                        colorScheme="red"
                        onClick={(e) => { e.stopPropagation(); handleDelete(params.data.id); }}
                    />
                </HStack>
            ),
            width: 120,
            pinned: 'right'
        }
    ];

    return (
        <VStack align="start" spacing={6} w="full">
            <HStack w="full" justify="space-between">
                <Box>
                    <Heading size="lg" mb={2}>People Management</Heading>
                    <Text color="gray.400">Manage development team members and their identities.</Text>
                </Box>
                <HStack spacing={3}>
                    <Button leftIcon={<FiDownload />} variant="outline" onClick={() => { setDiscoveredAuthors([]); setSelectedRepoId(''); onImportOpen(); }}>
                        Import from Git
                    </Button>
                    <Button leftIcon={<FiUserPlus />} colorScheme="brand" onClick={() => { setEditingId(null); setFormData({ name: '', email: '', gitUsername: '', msId: '' }); onOpen(); }}>
                        Add Person
                    </Button>
                </HStack>
            </HStack>

            <Box w="full" h="600px">
                <AgGridReact
                    rowData={rowData}
                    columnDefs={columnDefs}
                    defaultColDef={{ resizable: true }}
                    pagination={true}
                    paginationPageSize={20}
                    theme={gridTheme}
                />
            </Box>

            {/* Add/Edit Modal */}
            <Modal isOpen={isOpen} onClose={onClose}>
                <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(5px)" />
                <ModalContent bg="gray.800" color="white" borderColor="whiteAlpha.200" border="1px">
                    <ModalHeader>{editingId ? 'Edit Person' : 'Add New Person'}</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody pb={6}>
                        <VStack spacing={4}>
                            <FormControl isRequired>
                                <FormLabel>Full Name</FormLabel>
                                <Input
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="John Doe"
                                />
                            </FormControl>
                            <FormControl>
                                <FormLabel>Email Address</FormLabel>
                                <Input
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    placeholder="john@example.com"
                                />
                            </FormControl>
                            <FormControl>
                                <FormLabel>Git Username</FormLabel>
                                <Input
                                    value={formData.gitUsername}
                                    onChange={(e) => setFormData({ ...formData, gitUsername: e.target.value })}
                                    placeholder="johndoe_xq"
                                />
                            </FormControl>
                            <FormControl>
                                <FormLabel>Microsoft ID (Outlook/Teams)</FormLabel>
                                <Input
                                    value={formData.msId}
                                    onChange={(e) => setFormData({ ...formData, msId: e.target.value })}
                                    placeholder="j.doe@company.com"
                                />
                            </FormControl>
                        </VStack>
                    </ModalBody>
                    <ModalFooter borderTop="1px" borderColor="whiteAlpha.100">
                        <Button variant="ghost" mr={3} onClick={onClose}>Cancel</Button>
                        <Button colorScheme="brand" onClick={handleSubmit}>
                            {editingId ? 'Update' : 'Create'}
                        </Button>
                    </ModalFooter>
                </ModalContent>
            </Modal>

            {/* Git Import Modal */}
            <Modal isOpen={isImportOpen} onClose={onImportClose} size="4xl">
                <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(5px)" />
                <ModalContent bg="gray.800" color="white" borderColor="whiteAlpha.200" border="1px">
                    <ModalHeader>Import Git Authors</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody pb={6}>
                        <VStack spacing={6} align="stretch">
                            <FormControl isRequired>
                                <FormLabel>Select Repository to Scan</FormLabel>
                                <HStack>
                                    <Select
                                        placeholder="Choose a repository..."
                                        value={selectedRepoId}
                                        onChange={(e) => setSelectedRepoId(e.target.value)}
                                        bg="gray.700"
                                        borderColor="whiteAlpha.300"
                                    >
                                        {repositories.map(repo => (
                                            <option key={repo.id} value={repo.id} style={{ background: '#2D3748' }}>
                                                {repo.name} ({repo.type})
                                            </option>
                                        ))}
                                    </Select>
                                    <Button
                                        colorScheme="brand"
                                        onClick={handleScan}
                                        isLoading={isScanning}
                                        loadingText="Scanning"
                                        px={8}
                                    >
                                        Scan
                                    </Button>
                                </HStack>
                            </FormControl>

                            <Box maxH="40vh" overflowY="auto">
                                {isScanning ? (
                                    <Center p={10} flexDirection="column">
                                        <Spinner size="xl" mb={4} color="brand.400" />
                                        <Text>Scanning repository authors...</Text>
                                    </Center>
                                ) : discoveredAuthors.length === 0 ? (
                                    <Center p={10}>
                                        <Text color="gray.500">
                                            {selectedRepoId ? 'No new authors found.' : 'Select a repository and click Scan.'}
                                        </Text>
                                    </Center>
                                ) : (
                                    <Table variant="simple" size="sm">
                                        <Thead>
                                            <Tr>
                                                <Th color="gray.400">Name</Th>
                                                <Th color="gray.400">Email</Th>
                                                <Th color="gray.400">Commits</Th>
                                                <Th color="gray.400">Action</Th>
                                            </Tr>
                                        </Thead>
                                        <Tbody>
                                            {discoveredAuthors
                                                .filter(a => !rowData.some(p => p.email === a.email))
                                                .map((author, idx) => (
                                                    <Tr key={idx}>
                                                        <Td fontWeight="medium">{author.name}</Td>
                                                        <Td color="gray.400">{author.email}</Td>
                                                        <Td>
                                                            <Badge colorScheme="brand" variant="outline">{author.commits}</Badge>
                                                        </Td>
                                                        <Td>
                                                            <Button size="xs" colorScheme="brand" leftIcon={<FiPlus />} onClick={() => handleImport(author)}>
                                                                Import
                                                            </Button>
                                                        </Td>
                                                    </Tr>
                                                ))}
                                        </Tbody>
                                    </Table>
                                )}
                            </Box>
                        </VStack>
                    </ModalBody>
                </ModalContent>
            </Modal>

            {/* Delete Confirmation */}
            <ConfirmDialog
                isOpen={isDeleteOpen}
                onClose={onDeleteClose}
                onConfirm={confirmDelete}
                title="Delete Person"
                message="Are you sure you want to remove this person? This action will also remove them from all assigned teams."
            />
        </VStack>
    );
};
