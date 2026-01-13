import { Heading, Text, Grid, GridItem, Box, Stat, StatLabel, StatNumber, StatHelpText, StatArrow, VStack } from '@chakra-ui/react';
import { AgGridReact } from 'ag-grid-react';
import { type ColDef } from 'ag-grid-community';
import { useState } from 'react';
import { GrafanaEmbed } from '../components/GrafanaEmbed.tsx';
import { gridTheme } from '../theme/gridTheme';

export const Dashboard = () => {
    const [rowData] = useState([
        { repo: 'XQ/per', commits: 120, health: 'Stable', coverage: '85%' },
        { repo: 'XQ/wes', commits: 250, health: 'Critical', coverage: '62%' },
        { repo: 'XQ/commhub', commits: 85, health: 'Stable', coverage: '90%' },
    ]);

    const [columnDefs] = useState<ColDef[]>([
        { field: 'repo', headerName: 'Repository', flex: 1 },
        { field: 'commits', headerName: 'Commits (30d)', flex: 1 },
        { field: 'health', headerName: 'Health', flex: 1 },
        { field: 'coverage', headerName: 'Coverage', flex: 1 },
    ]);

    return (
        <VStack align="start" spacing={8} w="full">
            <Box>
                <Heading size="lg" mb={2}>Code & Quality Analytics</Heading>
                <Text color="gray.400">Engineering performance and quality overview across all repositories.</Text>
            </Box>

            {/* KPI Stats */}
            <Grid templateColumns="repeat(4, 1fr)" gap={6} w="full">
                <GridItem bg="gray.800" p={5} borderRadius="lg" border="1px" borderColor="whiteAlpha.100">
                    <Stat>
                        <StatLabel>Total Commits</StatLabel>
                        <StatNumber>1,245</StatNumber>
                        <StatHelpText>
                            <StatArrow type="increase" />
                            12% vs last month
                        </StatHelpText>
                    </Stat>
                </GridItem>
                <GridItem bg="gray.800" p={5} borderRadius="lg" border="1px" borderColor="whiteAlpha.100">
                    <Stat>
                        <StatLabel>Avg. Coverage</StatLabel>
                        <StatNumber>78.4%</StatNumber>
                        <StatHelpText>
                            <StatArrow type="increase" />
                            2.1% improvement
                        </StatHelpText>
                    </Stat>
                </GridItem>
                <GridItem bg="gray.800" p={5} borderRadius="lg" border="1px" borderColor="whiteAlpha.100">
                    <Stat>
                        <StatLabel>Active Developers</StatLabel>
                        <StatNumber>12</StatNumber>
                        <StatHelpText>No change</StatHelpText>
                    </Stat>
                </GridItem>
                <GridItem bg="gray.800" p={5} borderRadius="lg" border="1px" borderColor="whiteAlpha.100">
                    <Stat>
                        <StatLabel>Critical Issues</StatLabel>
                        <StatNumber>4</StatNumber>
                        <StatHelpText color="red.400">
                            <StatArrow type="increase" />
                            High risk
                        </StatHelpText>
                    </Stat>
                </GridItem>
            </Grid>

            {/* Main Content Areas */}
            <Grid templateColumns="repeat(2, 1fr)" gap={8} w="full">
                <GridItem h="400px">
                    <Box h="full" bg="gray.800" p={4} borderRadius="lg" border="1px" borderColor="whiteAlpha.100">
                        <Heading size="sm" mb={4}>Repository Health</Heading>
                        <Box h="320px">
                            <AgGridReact
                                rowData={rowData}
                                columnDefs={columnDefs}
                                defaultColDef={{ resizable: true, sortable: true }}
                                theme={gridTheme}
                            />
                        </Box>
                    </Box>
                </GridItem>
                <GridItem h="400px">
                    <GrafanaEmbed title="Commit Trends (Grafana)" />
                </GridItem>
            </Grid>
        </VStack>
    );
};
