
import React from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Legend
} from 'recharts';
import { Card, CardBody } from '../modern';

interface ProgressData {
    date: string;
    timestamp: number;
    score: number;
    percentage: number;
    bandScore: number;
    testTitle: string;
}

interface ProgressLineChartProps {
    data: ProgressData[];
    title?: string;
    height?: number;
}

export const ProgressLineChart: React.FC<ProgressLineChartProps> = ({
    data,
    title = 'Performance History',
    height = 300
}) => {
    if (!data || data.length === 0) {
        return (
            <Card variant="glass">
                <CardBody style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                    No progress data available yet.
                </CardBody>
            </Card>
        );
    }

    // Sort data by timestamp
    const sortedData = [...data].sort((a, b) => a.timestamp - b.timestamp);

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const point = payload[0].payload;
            return (
                <div style={{
                    background: 'rgba(255, 255, 255, 0.95)',
                    padding: '1rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.5rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    minWidth: '200px'
                }}>
                    <div style={{ fontWeight: 700, color: '#1e293b', marginBottom: '0.5rem' }}>
                        {point.date}
                    </div>
                    <div style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '0.5rem' }}>
                        {point.testTitle}
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.25rem' }}>
                        <span style={{ color: '#8b5cf6', fontWeight: 600 }}>Score:</span>
                        <span>{point.percentage}%</span>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem' }}>
                        <span style={{ color: '#10b981', fontWeight: 600 }}>Band:</span>
                        <span>{point.bandScore}</span>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <Card variant="glass">
            <CardBody style={{ padding: '1.5rem' }}>
                <h3 style={{
                    margin: '0 0 1.5rem 0',
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: '#1e293b'
                }}>
                    {title}
                </h3>

                <div style={{ width: '100%', height }}>
                    <ResponsiveContainer>
                        <LineChart
                            data={sortedData}
                            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                        >
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis
                                dataKey="date"
                                stroke="#64748b"
                                fontSize={12}
                                tickMargin={10}
                            />
                            <YAxis
                                yAxisId="left"
                                stroke="#8b5cf6"
                                fontSize={12}
                                domain={[0, 100]}
                                label={{ value: 'Percentage (%)', angle: -90, position: 'insideLeft', fill: '#8b5cf6' }}
                            />
                            <YAxis
                                yAxisId="right"
                                orientation="right"
                                stroke="#10b981"
                                fontSize={12}
                                domain={[0, 9]}
                                ticks={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]}
                                label={{ value: 'Band Score', angle: 90, position: 'insideRight', fill: '#10b981' }}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend />

                            <Line
                                yAxisId="left"
                                type="monotone"
                                dataKey="percentage"
                                name="Percentage"
                                stroke="#8b5cf6"
                                strokeWidth={3}
                                dot={{ r: 4, fill: '#8b5cf6', strokeWidth: 2, stroke: '#fff' }}
                                activeDot={{ r: 6 }}
                            />

                            <Line
                                yAxisId="right"
                                type="monotone"
                                dataKey="bandScore"
                                name="Band Score"
                                stroke="#10b981"
                                strokeWidth={3}
                                dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
                                activeDot={{ r: 6 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </CardBody>
        </Card>
    );
};
