import {
    Box,
    Collapse,
    HStack,
    Icon,
    IconButton,
    Text,
    VStack,
    useDisclosure,
    Spinner,
    Checkbox,
} from '@chakra-ui/react';
import { FiChevronRight, FiChevronDown, FiFolder, FiPackage, FiGithub, FiGitlab, FiHardDrive, FiTrash2, FiRefreshCw, FiEdit2, FiSearch } from 'react-icons/fi';
import { useMemo, memo, createContext, useContext } from 'react';

interface Project {
    id: string;
    name: string;
    path?: string; // Absolute path
    isSelected: boolean;
}

interface Repository {
    id: string;
    name: string;
    url: string;
    remoteUrl?: string | null;
    type: string;
    projects: Project[];
    syncStatus?: 'IDLE' | 'SYNCING' | 'ERROR';
    lastSyncedAt?: string | null;
}

interface TreeViewProps {
    repositories: Repository[];
    onToggleProject?: (projectId: string | string[], forceState?: boolean) => void;
    onDeleteRepo?: (repoId: string) => void;
    onEditRepo?: (repo: Repository) => void;
    onDiscover?: (repoId: string) => void;
    onSync?: (repoId: string) => void;
    selectionMode?: boolean;
    onSelectProject?: (projectId: string, projectName: string) => void;
    selectedProjectId?: string;
}

// Context for optimized selection
const SelectionContext = createContext<{
    selectedIds: Set<string>;
    toggleProject: (ids: string | string[], forceState?: boolean) => void;
}>({
    selectedIds: new Set(),
    toggleProject: () => { },
});

// Helper to recursively collect all project IDs under a node
const getAllProjectIds = (node: any): string[] => {
    let ids: string[] = [];
    if (node.projectData) {
        ids.push(node.projectData.id);
    }
    if (node.children) {
        Object.values(node.children).forEach((child: any) => {
            ids = ids.concat(getAllProjectIds(child));
        });
    }
    return ids;
};

// Helper to build tree from flat projects list based on paths
const buildProjectTree = (projects: Project[], rootPath: string) => {
    const root: any = { name: 'root', children: {}, projects: [] };

    projects.forEach(p => {
        if (!p.path) return;

        // Calculate relative path from repository root
        let relPath = p.path;
        if (p.path.startsWith(rootPath)) {
            relPath = p.path.substring(rootPath.length);
        }

        // Remove leading/trailing slashes and split
        const parts = relPath.split(/[/\\]/).filter(Boolean);

        // If it's the root project itself (path matches rootPath)
        if (parts.length === 0) {
            root.projectData = p;
            return;
        }

        let current = root;
        parts.forEach((part, index) => {
            if (!current.children[part]) {
                current.children[part] = { name: part, children: {}, projects: [] };
            }

            if (index === parts.length - 1) {
                // This is the project node itself
                current.children[part].projectData = p;
            } else {
                current = current.children[part];
            }
        });
    });

    return root;
};

// Recursive Node Component
const FileNode = memo(({ node, depth, onSelect, selectedId, selectionMode }: any) => {
    const { isOpen, onToggle } = useDisclosure({ defaultIsOpen: false });
    const { selectedIds, toggleProject } = useContext(SelectionContext);

    const hasChildren = Object.keys(node.children).length > 0;
    const isProject = !!node.projectData;
    const isSelected = isProject && selectedIds.has(node.projectData.id);

    return (
        <Box w="full" pl={depth * 3}>
            <HStack
                py={1}
                px={2}
                borderRadius="sm"
                _hover={{ bg: 'whiteAlpha.50' }}
                cursor={isProject && selectionMode ? "pointer" : "default"}
                onClick={(e) => {
                    e.stopPropagation();
                    if (isProject && selectionMode && onSelect) {
                        onSelect(node.projectData.id, node.projectData.name);
                    } else if (hasChildren) {
                        onToggle();
                    }
                }}
                bg={selectionMode && isProject && selectedId === node.projectData?.id ? 'blue.500' : 'transparent'}
            >
                {hasChildren ? (
                    <IconButton
                        aria-label="Toggle"
                        icon={<Icon as={isOpen ? FiChevronDown : FiChevronRight} />}
                        size="xs"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); onToggle(); }}
                        h={4} w={4} minW={4}
                    />
                ) : <Box w={4} />}

                <Icon
                    as={isProject ? FiPackage : FiFolder}
                    color={isProject ? (selectionMode && selectedId === node.projectData?.id ? 'white' : 'blue.300') : 'gray.500'}
                />

                {!selectionMode && (isProject || hasChildren) && (
                    <Checkbox
                        isChecked={isProject ? isSelected : getAllProjectIds(node).every(id => selectedIds.has(id)) && getAllProjectIds(node).length > 0}
                        isIndeterminate={!isProject && getAllProjectIds(node).some(id => selectedIds.has(id)) && !getAllProjectIds(node).every(id => selectedIds.has(id))}
                        onChange={(e) => {
                            e.stopPropagation();
                            const ids = getAllProjectIds(node);
                            const currentState = isProject ? isSelected : ids.every(id => selectedIds.has(id));
                            toggleProject(ids, !currentState);
                        }}
                        colorScheme="brand"
                        size="sm"
                    />
                )}

                <Text fontSize="sm" color={selectionMode && isProject && selectedId === node.projectData?.id ? 'white' : 'inherit'}>
                    {node.name}
                </Text>
            </HStack>

            <Collapse in={isOpen}>
                <VStack align="start" spacing={0} w="full">
                    {Object.values(node.children).map((child: any) => (
                        <FileNode
                            key={child.name}
                            node={child}
                            depth={depth + 1}
                            onSelect={onSelect}
                            selectedId={selectedId}
                            selectionMode={selectionMode}
                        />
                    ))}
                </VStack>
            </Collapse>
        </Box>
    );
});

const RepoNode = memo(({ repo, onDeleteRepo, onEditRepo, onDiscover, onSync, selectionMode, onSelectProject, selectedProjectId }: any) => {
    const { isOpen, onToggle } = useDisclosure();
    const { selectedIds, toggleProject } = useContext(SelectionContext);

    // Memoize the tree structure
    const treeRoot = useMemo(() => buildProjectTree(repo.projects, repo.url), [repo.projects, repo.url]);

    const getTypeIcon = (type: string) => {
        switch (type) {
            case 'GITHUB': return FiGithub;
            case 'GITLAB': return FiGitlab;
            default: return FiHardDrive;
        }
    };

    return (
        <Box w="full" border="1px solid" borderColor="whiteAlpha.100" borderRadius="md" mb={2}>
            <HStack
                p={2}
                _hover={{ bg: 'whiteAlpha.50' }}
                cursor="pointer"
                spacing={2}
                bg="whiteAlpha.50"
                onClick={onToggle}
            >
                <Icon as={isOpen ? FiChevronDown : FiChevronRight} />
                <Icon as={getTypeIcon(repo.type)} color="brand.400" />
                <VStack align="start" spacing={0} flex={1}>
                    <Text fontWeight="semibold" fontSize="sm">{repo.name}</Text>
                    {!selectionMode && <Text fontSize="xs" color="gray.500">{repo.url}</Text>}
                </VStack>

                <HStack spacing={1}>
                    <IconButton
                        aria-label="Edit"
                        icon={<FiEdit2 />}
                        size="sm"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); onEditRepo(repo); }}
                    />
                    <IconButton
                        aria-label="Sync"
                        icon={repo.syncStatus === 'SYNCING' ? <Spinner size="xs" /> : <FiRefreshCw />}
                        size="sm"
                        variant="ghost"
                        colorScheme={repo.syncStatus === 'ERROR' ? 'red' : 'brand'}
                        isDisabled={repo.syncStatus === 'SYNCING'}
                        onClick={(e) => { e.stopPropagation(); onSync && onSync(repo.id); }}
                    />
                    <IconButton
                        aria-label="Discover"
                        icon={<FiSearch />}
                        size="sm"
                        variant="ghost"
                        onClick={(e) => { e.stopPropagation(); onDiscover(repo.id); }}
                    />
                    <IconButton
                        aria-label="Delete"
                        icon={<FiTrash2 />}
                        size="sm"
                        variant="ghost"
                        colorScheme="red"
                        onClick={(e) => { e.stopPropagation(); onDeleteRepo(repo.id); }}
                    />
                </HStack>
            </HStack>

            <Collapse in={isOpen} animateOpacity>
                <Box p={2} borderTop="1px solid" borderColor="whiteAlpha.100">
                    {Object.keys(treeRoot.children).length === 0 && repo.projects.length === 0 && (
                        <Text fontSize="xs" color="gray.500" fontStyle="italic" p={2}>
                            No projects found. Try discovering.
                        </Text>
                    )}

                    {/* Render root project data if repository itself is a project */}
                    {treeRoot.projectData && (
                        <VStack align="start" spacing={1} mb={2} pl={4}>
                            <HStack py={1}>
                                {!selectionMode && (
                                    <Checkbox
                                        isChecked={selectedIds.has(treeRoot.projectData.id)}
                                        onChange={() => {
                                            const ids = getAllProjectIds(treeRoot);
                                            const isCurrentlySelected = selectedIds.has(treeRoot.projectData.id);
                                            toggleProject(ids, !isCurrentlySelected);
                                        }}
                                        colorScheme="brand"
                                        size="sm"
                                    />
                                )}
                                <Icon as={FiPackage} color="blue.300" />
                                <Text fontSize="sm">{repo.name} (Root)</Text>
                            </HStack>
                        </VStack>
                    )}

                    {/* Render Recursive Tree */}
                    <VStack align="start" spacing={0} w="full">
                        {Object.values(treeRoot.children).map((child: any) => (
                            <FileNode
                                key={child.name}
                                node={child}
                                depth={0}
                                onSelect={onSelectProject}
                                selectedId={selectedProjectId}
                                selectionMode={selectionMode}
                            />
                        ))}
                    </VStack>
                </Box>
            </Collapse>
        </Box>
    );
});

export const TreeView = (props: TreeViewProps) => {
    // Collect all selected IDs for the context
    const selectedIds = useMemo(() => {
        const ids = new Set<string>();
        props.repositories.forEach(repo => {
            repo.projects.forEach(p => {
                if (p.isSelected) ids.add(p.id);
            });
        });
        return ids;
    }, [props.repositories]);

    const contextValue = useMemo(() => ({
        selectedIds,
        toggleProject: props.onToggleProject || (() => { })
    }), [selectedIds, props.onToggleProject]);

    return (
        <SelectionContext.Provider value={contextValue}>
            <VStack align="start" spacing={2} w="full">
                {props.repositories.length === 0 && (
                    <Box p={10} textAlign="center" w="full" bg="whiteAlpha.50" borderRadius="xl" border="2px dashed" borderColor="whiteAlpha.100">
                        <Icon as={FiFolder} fontSize="3xl" color="gray.600" mb={2} />
                        <Text color="gray.500">No repositories added yet.</Text>
                    </Box>
                )}
                {props.repositories.map((repo) => (
                    <RepoNode
                        key={repo.id}
                        repo={repo}
                        {...props}
                    />
                ))}
            </VStack>
        </SelectionContext.Provider>
    );
};
