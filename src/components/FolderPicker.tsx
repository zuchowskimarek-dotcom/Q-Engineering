import React, { useState, useEffect } from 'react';
import {
    Modal, ModalOverlay, ModalContent, ModalHeader, ModalFooter,
    ModalBody, ModalCloseButton, Button, VStack, HStack, Text,
    Icon, Box, IconButton, Breadcrumb, BreadcrumbItem, BreadcrumbLink,
    Spinner, useToast, Tooltip
} from '@chakra-ui/react';
import { FiFolder, FiChevronRight, FiArrowLeft, FiHome, FiCheck } from 'react-icons/fi';

interface FolderPickerProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (path: string) => void;
    initialPath?: string;
}

interface DirectoryInfo {
    name: string;
    path: string;
}

interface LsResponse {
    currentPath: string;
    parentPath: string;
    directories: DirectoryInfo[];
}

const API_URL = 'http://localhost:3001/api';

export const FolderPicker: React.FC<FolderPickerProps> = ({ isOpen, onClose, onSelect, initialPath }) => {
    const [currentPath, setCurrentPath] = useState(initialPath || '');
    const [data, setData] = useState<LsResponse | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const toast = useToast();

    const fetchPath = async (path: string) => {
        setIsLoading(true);
        try {
            const url = `${API_URL}/fs/ls?path=${encodeURIComponent(path)}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error('Failed to read directory');
            const result = await res.json();
            setData(result);
            setCurrentPath(result.currentPath);
        } catch (error) {
            toast({
                title: 'Error reading directory',
                description: 'Make sure the path exists and is accessible.',
                status: 'error',
                duration: 3000
            });
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchPath(currentPath);
        }
    }, [isOpen]);

    const handleSelect = () => {
        onSelect(currentPath);
        onClose();
    };

    const pathParts = currentPath.split('/').filter(Boolean);

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="4xl" scrollBehavior="inside">
            <ModalOverlay backdropFilter="blur(4px)" />
            <ModalContent bg="gray.800" color="white" borderColor="whiteAlpha.200" border="1px" maxW="900px">
                <ModalHeader>Select Repository Folder</ModalHeader>
                <ModalCloseButton />
                <ModalBody p={0}>
                    <VStack align="stretch" spacing={0} h="full">
                        {/* Navigation Bar */}
                        <HStack px={4} py={2} bg="blackAlpha.300" borderBottom="1px" borderColor="whiteAlpha.100" spacing={3}>
                            <IconButton
                                aria-label="Go up"
                                icon={<FiArrowLeft />}
                                size="sm"
                                variant="ghost"
                                isDisabled={!data?.parentPath || data.parentPath === currentPath}
                                onClick={() => data?.parentPath && fetchPath(data.parentPath)}
                            />
                            <IconButton
                                aria-label="Home"
                                icon={<FiHome />}
                                size="sm"
                                variant="ghost"
                                onClick={() => fetchPath('')}
                            />
                            <Box flex={1} overflow="hidden">
                                <Breadcrumb spacing="8px" separator={<FiChevronRight color="gray.500" />}>
                                    <BreadcrumbItem>
                                        <BreadcrumbLink onClick={() => fetchPath('/')}>/</BreadcrumbLink>
                                    </BreadcrumbItem>
                                    {pathParts.map((part, i) => (
                                        <BreadcrumbItem key={part}>
                                            <BreadcrumbLink
                                                onClick={() => fetchPath('/' + pathParts.slice(0, i + 1).join('/'))}
                                                isCurrentPage={i === pathParts.length - 1}
                                                maxW="300px"
                                                isTruncated
                                            >
                                                {part}
                                            </BreadcrumbLink>
                                        </BreadcrumbItem>
                                    ))}
                                </Breadcrumb>
                            </Box>
                        </HStack>

                        {/* Directory List */}
                        <Box
                            flex={1}
                            h="500px"
                            overflowY="auto"
                            px={2}
                            py={2}
                            css={{
                                '&::-webkit-scrollbar': {
                                    width: '10px',
                                },
                                '&::-webkit-scrollbar-track': {
                                    background: 'rgba(0, 0, 0, 0.1)',
                                    borderRadius: '10px',
                                },
                                '&::-webkit-scrollbar-thumb': {
                                    background: '#4A5568',
                                    borderRadius: '10px',
                                    border: '2px solid transparent',
                                    backgroundClip: 'padding-box',
                                },
                                '&::-webkit-scrollbar-thumb:hover': {
                                    background: '#718096',
                                    border: '2px solid transparent',
                                    backgroundClip: 'padding-box',
                                },
                                'scrollbar-gutter': 'stable',
                            }}
                        >
                            {isLoading ? (
                                <HStack justify="center" h="full">
                                    <Spinner color="brand.400" />
                                </HStack>
                            ) : (
                                <VStack align="stretch" spacing={1}>
                                    {/* Parent Directory Link ('..') */}
                                    {data?.parentPath && data.parentPath !== currentPath && (
                                        <HStack
                                            px={3}
                                            py={2}
                                            borderRadius="md"
                                            cursor="pointer"
                                            _hover={{ bg: "whiteAlpha.100" }}
                                            onClick={() => fetchPath(data.parentPath)}
                                            transition="all 0.1s"
                                        >
                                            <Icon as={FiArrowLeft} color="gray.500" />
                                            <Text fontSize="sm" fontWeight="bold" color="gray.400">..</Text>
                                        </HStack>
                                    )}

                                    {data?.directories.length === 0 ? (
                                        <VStack justify="center" py={10} color="gray.500">
                                            <Icon as={FiFolder} fontSize="3xl" mb={2} />
                                            <Text>No subdirectories found</Text>
                                        </VStack>
                                    ) : (
                                        data?.directories.map((dir) => (
                                            <Tooltip key={dir.path} label={dir.path} placement="right" openDelay={500} hasArrow>
                                                <HStack
                                                    px={3}
                                                    py={2}
                                                    borderRadius="md"
                                                    cursor="pointer"
                                                    _hover={{ bg: "whiteAlpha.100" }}
                                                    onClick={() => fetchPath(dir.path)}
                                                    transition="all(0.1s)"
                                                >
                                                    <Icon as={FiFolder} color="brand.400" />
                                                    <Text fontSize="sm" flex={1} isTruncated>{dir.name}</Text>
                                                    <FiChevronRight color="gray.600" />
                                                </HStack>
                                            </Tooltip>
                                        ))
                                    )}
                                </VStack>
                            )}
                        </Box>
                    </VStack>
                </ModalBody>
                <ModalFooter borderTop="1px" borderColor="whiteAlpha.100" bg="blackAlpha.200">
                    <HStack w="full" justify="space-between">
                        <Text fontSize="xs" color="gray.400" isTruncated maxW="300px">
                            Selected: {currentPath}
                        </Text>
                        <HStack>
                            <Button variant="ghost" onClick={onClose} size="sm">Cancel</Button>
                            <Button
                                colorScheme="brand"
                                leftIcon={<FiCheck />}
                                onClick={handleSelect}
                                size="sm"
                            >
                                Select Folder
                            </Button>
                        </HStack>
                    </HStack>
                </ModalFooter>
            </ModalContent>
        </Modal>
    );
};
