import {
    Box, Heading, Flex, Select, FormControl, FormLabel, SimpleGrid,
    Checkbox, Stack, Popover, PopoverTrigger,
    PopoverContent, Button, Tag, TagLabel, Wrap, WrapItem,
    Text, useDisclosure
} from '@chakra-ui/react';
import { useState, useEffect } from 'react';
import { FiChevronDown } from 'react-icons/fi';

const GRAFANA_URL = 'http://localhost:3000';
const DASHBOARD_UID = 'project-metrics';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3003/api';

const MultiSelect = ({ label, options, selected, onChange, placeholder }: any) => {
    const { isOpen, onOpen, onClose } = useDisclosure();

    const isAllSelected = options.length > 0 && selected.length === options.length;

    const toggleAll = () => {
        if (isAllSelected) {
            onChange([]);
        } else {
            onChange(options.map((o: any) => o.id));
        }
    };

    const toggleOption = (id: string) => {
        if (selected.includes(id)) {
            onChange(selected.filter((s: string) => s !== id));
        } else {
            onChange([...selected, id]);
        }
    };

    const selectedLabels = options
        .filter((o: any) => selected.includes(o.id))
        .map((o: any) => o.name);

    let buttonText = placeholder;
    if (options.length === 0) {
        buttonText = `No ${label} Available`;
    } else if (isAllSelected) {
        buttonText = `All ${label}`;
    } else if (selected.length > 0) {
        buttonText = `${selected.length} Selected`;
    } else {
        buttonText = `None Selected`;
    }

    return (
        <FormControl variant="floating" w="220px">
            <FormLabel>{label}</FormLabel>
            <Popover isOpen={isOpen} onOpen={onOpen} onClose={onClose} placement="bottom-start" matchWidth>
                <PopoverTrigger>
                    <Button
                        w="100%"
                        justifyContent="space-between"
                        variant="outline"
                        bg="gray.800"
                        borderColor="whiteAlpha.200"
                        _hover={{ borderColor: 'whiteAlpha.400' }}
                        rightIcon={<FiChevronDown />}
                        px={3}
                        fontWeight="normal"
                    >
                        <Text isTruncated>
                            {buttonText}
                        </Text>
                    </Button>
                </PopoverTrigger>
                <PopoverContent bg="gray.800" borderColor="whiteAlpha.300" maxH="300px" overflowY="auto" p={2}>
                    <Stack spacing={2}>
                        {options.length > 0 && (
                            <Checkbox
                                isChecked={isAllSelected}
                                onChange={toggleAll}
                                colorScheme="blue"
                                fontWeight="bold"
                                borderBottom="1px solid"
                                borderColor="whiteAlpha.200"
                                pb={2}
                                mb={1}
                            >
                                (All)
                            </Checkbox>
                        )}
                        {options.map((opt: any) => (
                            <Checkbox
                                key={opt.id}
                                isChecked={selected.includes(opt.id)}
                                onChange={() => toggleOption(opt.id)}
                                colorScheme="blue"
                            >
                                {opt.name}
                            </Checkbox>
                        ))}
                        {options.length === 0 && (
                            <Text fontSize="sm" color="whiteAlpha.500" p={2}>
                                No options available
                            </Text>
                        )}
                    </Stack>
                </PopoverContent>
            </Popover>
            {selected.length > 0 && !isAllSelected && (
                <Wrap mt={2} spacing={1}>
                    {selectedLabels.map((lbl: string, idx: number) => (
                        <WrapItem key={idx}>
                            <Tag size="sm" variant="subtle" colorScheme="blue">
                                <TagLabel>{lbl}</TagLabel>
                            </Tag>
                        </WrapItem>
                    ))}
                </Wrap>
            )}
        </FormControl>
    );
};

export const Metrics = () => {
    const [teams, setTeams] = useState<any[]>([]);
    const [projects, setProjects] = useState<any[]>([]);
    const [members, setMembers] = useState<any[]>([]);
    const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
    const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
    const [selectedProjects, setSelectedProjects] = useState<string[]>([]);
    const [selectedTimeRange, setSelectedTimeRange] = useState('now-7d');
    const [selectedViewBy, setSelectedViewBy] = useState('project');

    useEffect(() => {
        fetch(`${API_URL}/teams`).then(res => res.json()).then(data => {
            setTeams(data);
            setSelectedTeams(data.map((t: any) => t.id));
        });
    }, []);

    useEffect(() => {
        if (selectedTeams.length === 0) {
            setMembers([]);
            setSelectedMembers([]);
            return;
        }
        const teamIds = selectedTeams.join(',');
        fetch(`${API_URL}/metrics/members?teamIds=${teamIds}`)
            .then(res => res.json())
            .then(data => {
                setMembers(data);
                setSelectedMembers(data.map((m: any) => m.id));
            });
    }, [selectedTeams]);

    useEffect(() => {
        if (selectedTeams.length === 0) {
            setProjects([]);
            setSelectedProjects([]);
            return;
        }
        const teamIds = selectedTeams.join(',');
        const memberIds = selectedMembers.join(',');
        fetch(`${API_URL}/metrics/projects?teamIds=${teamIds}&memberIds=${memberIds}`)
            .then(res => res.json())
            .then(data => {
                setProjects(data);
                setSelectedProjects(data.map((p: any) => p.id));
            });
    }, [selectedTeams, selectedMembers]);

    const getFullUrl = (panelId?: number) => {
        let url = `${GRAFANA_URL}/d-solo/${DASHBOARD_UID}/project-engineering-metrics?orgId=1&theme=dark&from=${selectedTimeRange}&to=now`;

        const addFilter = (paramName: string, selected: string[], options: any[]) => {
            if (selected.length === 0) {
                url += `&var-${paramName}=_none_`;
            } else if (selected.length === options.length && options.length > 0) {
                url += `&var-${paramName}=$__all`;
            } else {
                selected.forEach(id => url += `&var-${paramName}=${id}`);
            }
        };

        addFilter('team', selectedTeams, teams);
        addFilter('member', selectedMembers, members);
        addFilter('project', selectedProjects, projects);

        url += `&var-view_by=${selectedViewBy}`;
        if (panelId) url += `&panelId=${panelId}`;
        return url;
    };

    return (
        <Box>
            <Flex justify="space-between" align="center" mb={8} wrap="wrap" gap={4}>
                <Heading size="lg">Engineering Metrics</Heading>
                <Flex gap={4} wrap="wrap" align="flex-start">
                    <FormControl variant="floating" id="time-range-filter" w="180px">
                        <FormLabel>Time Range</FormLabel>
                        <Select
                            value={selectedTimeRange}
                            onChange={(e) => setSelectedTimeRange(e.target.value)}
                            bg="gray.800"
                        >
                            <option value="now-24h">Last 24 Hours</option>
                            <option value="now-72h">Last 72 Hours</option>
                            <option value="now-7d">Last 7 Days</option>
                            <option value="now-30d">Last 30 Days</option>
                            <option value="now-90d">Last 90 Days</option>
                            <option value="now-6M">Last 6 Months</option>
                            <option value="now-1y">Last 1 Year</option>
                            <option value="now-2y">Last 2 Years</option>
                        </Select>
                    </FormControl>

                    <FormControl variant="floating" id="view-by-filter" w="180px">
                        <FormLabel>Group By</FormLabel>
                        <Select
                            value={selectedViewBy}
                            onChange={(e) => setSelectedViewBy(e.target.value)}
                            bg="gray.800"
                        >
                            <option value="project">Project</option>
                            <option value="team">Team</option>
                            <option value="member">Member</option>
                        </Select>
                    </FormControl>

                    <MultiSelect
                        label="Teams"
                        options={teams}
                        selected={selectedTeams}
                        onChange={setSelectedTeams}
                        placeholder="Select Teams"
                    />

                    <MultiSelect
                        label="Members"
                        options={members}
                        selected={selectedMembers}
                        onChange={setSelectedMembers}
                        placeholder="Select Members"
                    />

                    <MultiSelect
                        label="Projects"
                        options={projects}
                        selected={selectedProjects}
                        onChange={setSelectedProjects}
                        placeholder="Select Projects"
                    />
                </Flex>
            </Flex>

            <SimpleGrid columns={{ base: 1, lg: 2 }} spacing={6} mb={6}>
                <Box bg="gray.800" borderRadius="lg" overflow="hidden" h="400px" border="1px solid" borderColor="whiteAlpha.100">
                    <iframe src={getFullUrl(4)} width="100%" height="100%" frameBorder="0"></iframe>
                </Box>
                <Box bg="gray.800" borderRadius="lg" overflow="hidden" h="400px" border="1px solid" borderColor="whiteAlpha.100">
                    <iframe src={getFullUrl(5)} width="100%" height="100%" frameBorder="0"></iframe>
                </Box>
                <Box bg="gray.800" borderRadius="lg" overflow="hidden" h="400px" border="1px solid" borderColor="whiteAlpha.100">
                    <iframe src={getFullUrl(1)} width="100%" height="100%" frameBorder="0"></iframe>
                </Box>
                <Box bg="gray.800" borderRadius="lg" overflow="hidden" h="400px" border="1px solid" borderColor="whiteAlpha.100">
                    <iframe src={getFullUrl(2)} width="100%" height="100%" frameBorder="0"></iframe>
                </Box>
            </SimpleGrid>

            <Box bg="gray.800" borderRadius="lg" overflow="hidden" h="500px" border="1px solid" borderColor="whiteAlpha.100">
                <iframe src={getFullUrl(3)} width="100%" height="100%" frameBorder="0"></iframe>
            </Box>
        </Box>
    );
};
