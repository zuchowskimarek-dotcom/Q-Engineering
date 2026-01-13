import { Box, Flex, VStack, Text, Icon, Link as ChakraLink, Heading } from '@chakra-ui/react';
import { type ReactNode } from 'react';
import { NavLink as RouterLink } from 'react-router-dom';
import { FiHome, FiUsers, FiUser, FiFolder } from 'react-icons/fi';

interface SidebarItemProps {
    icon: any;
    children: string;
    to: string;
}

const SidebarItem = ({ icon, children, to }: SidebarItemProps) => (
    <ChakraLink
        as={RouterLink}
        to={to}
        w="full"
        _activeLink={{
            bg: 'brand.500',
            color: 'white',
        }}
        p={3}
        borderRadius="md"
        _hover={{
            textDecoration: 'none',
            bg: 'whiteAlpha.200',
        }}
        display="flex"
        alignItems="center"
    >
        <Icon as={icon} mr={3} />
        <Text>{children}</Text>
    </ChakraLink>
);

export const MainLayout = ({ children }: { children: ReactNode }) => {
    return (
        <Flex h="100dvh" overflow="hidden">
            {/* Sidebar */}
            <Box
                w="280px"
                bg="gray.900"
                p={5}
                display="flex"
                flexDirection="column"
                borderRight="1px"
                borderColor="whiteAlpha.100"
            >
                <Heading size="md" mb={10} color="brand.400" letterSpacing="tight">
                    Q-ENGINEERING
                </Heading>
                <VStack align="start" spacing={2} flex={1}>
                    <SidebarItem icon={FiHome} to="/">Dashboard</SidebarItem>
                    <SidebarItem icon={FiUsers} to="/teams">Teams</SidebarItem>
                    <SidebarItem icon={FiUser} to="/people">People</SidebarItem>
                    <SidebarItem icon={FiFolder} to="/repositories">Repositories</SidebarItem>
                </VStack>
            </Box>

            {/* Main Content */}
            <Box
                flex={1}
                overflowY="auto"
                bg="gray.900"
                css={{
                    '&::-webkit-scrollbar': {
                        width: '10px',
                    },
                    '&::-webkit-scrollbar-track': {
                        background: 'rgba(0, 0, 0, 0.05)',
                        borderRadius: '10px',
                    },
                    '&::-webkit-scrollbar-thumb': {
                        background: '#2D3748',
                        borderRadius: '10px',
                        border: '2px solid transparent',
                        backgroundClip: 'padding-box',
                    },
                    '&::-webkit-scrollbar-thumb:hover': {
                        background: '#4A5568',
                        border: '2px solid transparent',
                        backgroundClip: 'padding-box',
                    },
                    'scrollbar-gutter': 'stable',
                }}
            >
                <Box p={8}>
                    {children}
                </Box>
            </Box>
        </Flex>
    );
};
