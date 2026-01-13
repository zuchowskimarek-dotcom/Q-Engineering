import { Box, Heading, Flex, Text, Icon } from '@chakra-ui/react';
import { FiBarChart2 } from 'react-icons/fi';

interface GrafanaEmbedProps {
    title: string;
}

export const GrafanaEmbed = ({ title }: GrafanaEmbedProps) => {
    return (
        <Box
            h="full"
            bg="gray.800"
            p={4}
            borderRadius="lg"
            border="1px"
            borderColor="whiteAlpha.100"
            position="relative"
        >
            <Heading size="sm" mb={4}>{title}</Heading>
            <Flex
                h="320px"
                bg="blackAlpha.400"
                borderRadius="md"
                align="center"
                justify="center"
                flexDirection="column"
                border="2px dashed"
                borderColor="whiteAlpha.200"
            >
                <Icon as={FiBarChart2} fontSize="4xl" color="brand.400" mb={4} />
                <Text color="gray.400">Grafana Dashboard Integration</Text>
                <Text fontSize="xs" color="gray.600" mt={2}>
                    (Placeholder for future iframe/embed integration)
                </Text>
            </Flex>
        </Box>
    );
};
