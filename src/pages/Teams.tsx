import {
    Heading, Text, VStack, Box, Button, useDisclosure,
    Modal, ModalOverlay, ModalContent, ModalHeader, ModalCloseButton,
    ModalBody, ModalFooter, FormControl, FormLabel, Input, useToast,
    HStack, IconButton, Tag, TagLabel, TagCloseButton, Select, Divider
} from '@chakra-ui/react';
import { AgGridReact } from 'ag-grid-react';
import { type ColDef } from 'ag-grid-community';
import { useState, useEffect, useCallback } from 'react';
import { FiUsers, FiTrash2, FiEdit2, FiPlus } from 'react-icons/fi';
import { gridTheme } from '../theme/gridTheme';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { TreeView } from '../components/TreeView';

const API_URL = 'http://localhost:3003/api';

interface Person {
    id: string;
    name: string;
    email?: string;
}

interface TeamMembership {
    person: Person;
    role?: string;
}

interface Team {
    id: string;
    name: string;
    description?: string;
    members: TeamMembership[];
    projects?: any[]; // Using any[] for simplicity as structure is nested
}

export const Teams = () => {
    const [rowData, setRowData] = useState<Team[]>([]);
    const [people, setPeople] = useState<Person[]>([]);
    const { isOpen, onOpen, onClose } = useDisclosure();
    const [formData, setFormData] = useState({ name: '', description: '' });
    const [editingId, setEditingId] = useState<string | null>(null);

    // Membership Modal
    const { isOpen: isMemOpen, onOpen: onMemOpen, onClose: onMemClose } = useDisclosure();
    const { isOpen: isDeleteOpen, onOpen: onDeleteOpen, onClose: onDeleteClose } = useDisclosure();

    const [teamToDelete, setTeamToDelete] = useState<string | null>(null);
    const [activeTeam, setActiveTeam] = useState<Team | null>(null);
    const [selectedPerson, setSelectedPerson] = useState('');

    const [repositories, setRepositories] = useState<any[]>([]);

    const toast = useToast();

    const fetchTeams = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/teams`);
            const data = await res.json();
            setRowData(data);
        } catch (error) {
            toast({ title: 'Error fetching teams', status: 'error' });
        }
    }, [toast]);

    const fetchPeople = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/people`);
            const data = await res.json();
            setPeople(data);
        } catch (error) {
            toast({ title: 'Error fetching people', status: 'error' });
        }
    }, [toast]);

    const fetchProjects = useCallback(async () => {
        try {
            const res = await fetch(`${API_URL}/repositories`);
            const repos = await res.json();
            setRepositories(repos);
        } catch (error) {
            console.error('Error fetching projects');
        }
    }, []);

    useEffect(() => {
        fetchTeams();
        fetchPeople();
        fetchProjects();
    }, [fetchTeams, fetchPeople, fetchProjects]);

    const handleSubmit = async () => {
        try {
            const method = editingId ? 'PUT' : 'POST';
            const url = editingId ? `${API_URL}/teams/${editingId}` : `${API_URL}/teams`;

            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData),
            });

            if (!res.ok) throw new Error();

            toast({ title: `Team ${editingId ? 'updated' : 'created'}`, status: 'success' });
            onClose();
            setEditingId(null);
            setFormData({ name: '', description: '' });
            fetchTeams();
        } catch (error) {
            toast({ title: 'Error saving team', status: 'error' });
        }
    };

    const handleDelete = (id: string) => {
        setTeamToDelete(id);
        onDeleteOpen();
    };

    const confirmDelete = async () => {
        if (!teamToDelete) return;
        try {
            await fetch(`${API_URL}/teams/${teamToDelete}`, { method: 'DELETE' });
            toast({ title: 'Team deleted', status: 'success' });
            fetchTeams();
            onDeleteClose();
        } catch (error) {
            toast({ title: 'Error deleting team', status: 'error' });
        }
    };

    const handleAddMember = async () => {
        if (!selectedPerson || !activeTeam) return;
        try {
            const res = await fetch(`${API_URL}/memberships`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ personId: selectedPerson, teamId: activeTeam.id }),
            });
            if (!res.ok) throw new Error();
            toast({ title: 'Member added', status: 'success' });
            setSelectedPerson('');
            fetchTeams();
            // Update active team locally for the UI
            const updatedTeamRes = await fetch(`${API_URL}/teams`);
            const allTeams = await updatedTeamRes.json();
            setActiveTeam(allTeams.find((t: any) => t.id === activeTeam.id));
        } catch (error) {
            toast({ title: 'Member already in team or error', status: 'error' });
        }
    };

    const handleRemoveMember = async (personId: string, teamId?: string) => {
        // Use provided teamId or fallback to activeTeam (for modal usage)
        const targetTeamId = teamId || activeTeam?.id;
        if (!targetTeamId) return;

        try {
            await fetch(`${API_URL}/memberships/${personId}/${targetTeamId}`, { method: 'DELETE' });
            toast({ title: 'Member removed', status: 'success' });
            fetchTeams();

            // If we are in the modal (activeTeam is set), update it too
            if (activeTeam && activeTeam.id === targetTeamId) {
                const updatedTeamRes = await fetch(`${API_URL}/teams`);
                const allTeams = await updatedTeamRes.json();
                setActiveTeam(allTeams.find((t: any) => t.id === targetTeamId));
            }
        } catch (error) {
            toast({ title: 'Error removing member', status: 'error' });
        }
    };

    const openEdit = (team: any) => {
        setEditingId(team.id);
        setFormData({ name: team.name, description: team.description || '' });
        onOpen();
    };

    const openMembers = (team: any) => {
        setActiveTeam(team);
        onMemOpen();
    };

    // Project Modal
    const { isOpen: isProjOpen, onOpen: onProjOpen, onClose: onProjClose } = useDisclosure();
    const [selectedProject, setSelectedProject] = useState('');

    const handleAddProject = async () => {
        if (!selectedProject || !activeTeam) return;
        try {
            const res = await fetch(`${API_URL}/team-projects`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ projectId: selectedProject, teamId: activeTeam.id }),
            });
            if (!res.ok) throw new Error();
            toast({ title: 'Project assigned', status: 'success' });
            setSelectedProject('');
            fetchTeams();

            // Update active team locally
            const updatedTeamRes = await fetch(`${API_URL}/teams`);
            const allTeams = await updatedTeamRes.json();
            setActiveTeam(allTeams.find((t: any) => t.id === activeTeam.id));
        } catch (error) {
            toast({ title: 'Project already assigned or error', status: 'error' });
        }
    };

    const handleRemoveProject = async (projectId: string, teamId?: string) => {
        const targetTeamId = teamId || activeTeam?.id;
        if (!targetTeamId) return;

        try {
            await fetch(`${API_URL}/team-projects/${projectId}/${targetTeamId}`, { method: 'DELETE' });
            toast({ title: 'Project removed', status: 'success' });
            fetchTeams();

            if (activeTeam && activeTeam.id === targetTeamId) {
                const updatedTeamRes = await fetch(`${API_URL}/teams`);
                const allTeams = await updatedTeamRes.json();
                setActiveTeam(allTeams.find((t: any) => t.id === targetTeamId));
            }
        } catch (error) {
            toast({ title: 'Error removing project', status: 'error' });
        }
    };

    const openProjects = (team: any) => {
        setActiveTeam(team);
        onProjOpen();
    };

    const columnDefs: ColDef[] = [
        { field: 'name', headerName: 'Team Name', flex: 1, sortable: true, filter: true },
        { field: 'description', headerName: 'Description', flex: 2 },
        {
            headerName: 'Members',
            cellRenderer: (params: any) => (
                <HStack spacing={1} h="full" align="center" wrap="wrap" overflowY="auto">
                    {params.data.members?.map((m: any) => (
                        <Tag key={m.person.id} size="sm" borderRadius="full" variant="subtle" colorScheme="brand">
                            <TagLabel>{m.person.name}</TagLabel>
                            <TagCloseButton onClick={(e) => { e.stopPropagation(); handleRemoveMember(m.person.id, params.data.id); }} />
                        </Tag>
                    ))}
                </HStack>
            ),
            flex: 2,
            autoHeight: true
        },
        {
            headerName: 'Projects',
            cellRenderer: (params: any) => (
                <HStack spacing={1} h="full" align="center" wrap="wrap" overflowY="auto">
                    {params.data.projects?.map((tp: any) => (
                        <Tag key={tp.project.id} size="sm" borderRadius="full" variant="outline" colorScheme="blue">
                            <TagLabel>{tp.project.repository.name}/{tp.project.name}</TagLabel>
                            <TagCloseButton onClick={(e) => { e.stopPropagation(); handleRemoveProject(tp.project.id, params.data.id); }} />
                        </Tag>
                    ))}
                </HStack>
            ),
            flex: 2,
            autoHeight: true
        },
        {
            headerName: 'Actions',
            cellRenderer: (params: any) => (
                <HStack spacing={1} h="full" align="center">
                    <IconButton
                        aria-label="Add Member"
                        icon={<FiUsers />}
                        size="sm"
                        variant="ghost"
                        colorScheme="brand"
                        title="Manage Members"
                        onClick={() => openMembers(params.data)}
                    />
                    <IconButton
                        aria-label="Add Project"
                        icon={<FiPlus />}
                        size="sm"
                        variant="ghost"
                        colorScheme="blue"
                        title="Add Project"
                        onClick={() => openProjects(params.data)}
                    />
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
            width: 180,
            pinned: 'right'
        }
    ];

    return (
        <VStack align="start" spacing={6} w="full">
            <HStack w="full" justify="space-between">
                <Box>
                    <Heading size="lg" mb={2}>Team Management</Heading>
                    <Text color="gray.400">Define squads and multi-team memberships.</Text>
                </Box>
                <Button leftIcon={<FiUsers />} colorScheme="brand" onClick={onOpen}>
                    Add Team
                </Button>
            </HStack>

            <Box w="full" h="600px">
                <AgGridReact
                    rowData={rowData}
                    columnDefs={columnDefs}
                    defaultColDef={{ resizable: true }}
                    pagination={true}
                    paginationPageSize={20}
                    getRowId={(params: any) => params.data.id}
                    theme={gridTheme}
                />
            </Box>

            {/* Team Create/Edit Modal */}
            <Modal isOpen={isOpen} onClose={onClose}>
                <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(5px)" />
                <ModalContent bg="gray.800" color="white" borderColor="whiteAlpha.200" border="1px">
                    <ModalHeader>{editingId ? 'Edit Team' : 'Add New Team'}</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody pb={6}>
                        <VStack spacing={4}>
                            <FormControl isRequired>
                                <FormLabel>Team Name</FormLabel>
                                <Input
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="The PER Engine Squad"
                                />
                            </FormControl>
                            <FormControl>
                                <FormLabel>Description</FormLabel>
                                <Input
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Backend and Runtime orchestration team"
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

            {/* Membership Modal */}
            <Modal isOpen={isMemOpen} onClose={onMemClose} size="lg">
                <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(5px)" />
                <ModalContent bg="gray.800" color="white" borderColor="whiteAlpha.200" border="1px">
                    <ModalHeader>Members: {activeTeam?.name}</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody pb={6}>
                        <VStack align="stretch" spacing={6}>
                            <Box>
                                <Text fontSize="sm" color="gray.400" mb={3}>CURRENT MEMBERS</Text>
                                <HStack wrap="wrap" spacing={2}>
                                    {activeTeam?.members?.length === 0 && <Text fontSize="xs" color="gray.500 italic">No members assigned yet.</Text>}
                                    {activeTeam?.members?.map((m: any) => (
                                        <Tag key={m.person.id} size="lg" borderRadius="full" variant="subtle" colorScheme="brand">
                                            <TagLabel>{m.person.name}</TagLabel>
                                            <TagCloseButton onClick={() => handleRemoveMember(m.person.id)} />
                                        </Tag>
                                    ))}
                                </HStack>
                            </Box>

                            <Divider borderColor="whiteAlpha.200" />

                            <Box>
                                <Text fontSize="sm" color="gray.400" mb={3}>ADD MEMBER</Text>
                                <HStack>
                                    <Select
                                        placeholder="Select person"
                                        bg="gray.700"
                                        borderColor="whiteAlpha.300"
                                        value={selectedPerson}
                                        onChange={(e) => setSelectedPerson(e.target.value)}
                                    >
                                        {people
                                            .filter(p => !activeTeam?.members?.some((m: any) => m.person.id === p.id))
                                            .map((p: any) => (
                                                <option key={p.id} value={p.id} style={{ background: '#2D3748' }}>
                                                    {p.name} ({p.email || 'No email'})
                                                </option>
                                            ))
                                        }
                                    </Select>
                                    <Button leftIcon={<FiPlus />} colorScheme="brand" onClick={handleAddMember} isDisabled={!selectedPerson}>
                                        Add
                                    </Button>
                                </HStack>
                            </Box>
                        </VStack>
                    </ModalBody>
                </ModalContent>
            </Modal>

            {/* Project Assignment Modal */}
            <Modal isOpen={isProjOpen} onClose={onProjClose} size="lg">
                <ModalOverlay bg="blackAlpha.700" backdropFilter="blur(5px)" />
                <ModalContent bg="gray.800" color="white" borderColor="whiteAlpha.200" border="1px">
                    <ModalHeader>Projects: {activeTeam?.name}</ModalHeader>
                    <ModalCloseButton />
                    <ModalBody pb={6}>
                        <VStack align="stretch" spacing={6}>
                            <Box>
                                <Text fontSize="sm" color="gray.400" mb={3}>ASSIGNED PROJECTS</Text>
                                <HStack wrap="wrap" spacing={2}>
                                    {(!activeTeam?.projects || activeTeam?.projects?.length === 0) && <Text fontSize="xs" color="gray.500 italic">No projects assigned yet.</Text>}
                                    {activeTeam?.projects?.map((tp: any) => (
                                        <Tag key={tp.project.id} size="lg" borderRadius="full" variant="outline" colorScheme="blue">
                                            <TagLabel>{tp.project.repository.name}/{tp.project.name}</TagLabel>
                                            <TagCloseButton onClick={() => handleRemoveProject(tp.project.id)} />
                                        </Tag>
                                    ))}
                                </HStack>
                            </Box>

                            <Divider borderColor="whiteAlpha.200" />

                            <Box>
                                <Text fontSize="sm" color="gray.400" mb={3}>ASSIGN PROJECT</Text>
                                <Box border="1px solid" borderColor="whiteAlpha.200" borderRadius="md" p={2} maxH="400px" overflowY="auto">
                                    <TreeView
                                        repositories={repositories} // Use full repositories with structure
                                        onToggleProject={() => { }} // Not used in selection mode
                                        onDeleteRepo={() => { }}
                                        onEditRepo={() => { }}
                                        onDiscover={() => { }}
                                        selectionMode={true}
                                        onSelectProject={(id, name) => setSelectedProject(id)}
                                        selectedProjectId={selectedProject}
                                    />
                                </Box>
                                <Button leftIcon={<FiPlus />} colorScheme="blue" onClick={handleAddProject} isDisabled={!selectedProject} w="full">
                                    Assign Selected Project
                                </Button>
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
                title="Delete Team"
                message="Are you sure? This will remove the team and all its memberships. Individual people will not be deleted."
            />
        </VStack>
    );
};
