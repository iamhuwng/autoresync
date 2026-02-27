
import React from 'react';
import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    ResponsiveContainer,
    Tooltip
} from 'recharts';
import { Card, CardBody } from '../modern';

interface SkillData {
    skill: string;
    score: number; // Percentage or Band Score depending on usage
    fullMark: number;
}

interface SkillRadarChartProps {
    data: SkillData[];
    title?: string;
    height?: number;
}

export const SkillRadarChart: React.FC<SkillRadarChartProps> = ({
    data,
    title = 'Skill Breakdown',
    height = 300
}) => {
    if (!data || data.length === 0) {
        return (
            <Card variant="glass">
                <CardBody style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                    No skill data available.
                </CardBody>
            </Card>
        );
    }

    // Ensure data structure matches Recharts expectation
    // Recharts RadarChart uses 'subject' (skill) and 'A' (value) usually
    const chartData = data.map(d => ({
        subject: d.skill.charAt(0).toUpperCase() + d.skill.slice(1),
        A: d.score,
        fullMark: d.fullMark
    }));

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const point = payload[0].payload;
            return (
                <div style={{
                    background: 'rgba(255, 255, 255, 0.95)',
                    padding: '0.5rem 1rem',
                    border: '1px solid #e2e8f0',
                    borderRadius: '0.5rem',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                }}>
                    <div style={{ fontWeight: 600, color: '#1e293b' }}>
                        {point.subject}
                    </div>
                    <div style={{ color: '#8b5cf6' }}>
                        Score: {point.A}
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
                    margin: '0 0 1rem 0',
                    fontSize: '1.25rem',
                    fontWeight: 700,
                    color: '#1e293b',
                    textAlign: 'center'
                }}>
                    {title}
                </h3>

                <div style={{ width: '100%', height }}>
                    <ResponsiveContainer>
                        <RadarChart cx="50%" cy="50%" outerRadius="80%" data={chartData}>
                            <PolarGrid stroke="#e2e8f0" />
                            <PolarAngleAxis
                                dataKey="subject"
                                tick={{ fill: '#64748b', fontSize: 12, fontWeight: 600 }}
                            />
                            <PolarRadiusAxis
                                angle={30}
                                domain={[0, data[0]?.fullMark || 100]}
                                tick={false}
                                axisLine={false}
                            />
                            <Radar
                                name="Skill"
                                dataKey="A"
                                stroke="#8b5cf6"
                                strokeWidth={2}
                                fill="#8b5cf6"
                                fillOpacity={0.5}
                            />
                            <Tooltip content={<CustomTooltip />} />
                        </RadarChart>
                    </ResponsiveContainer>
                </div>
            </CardBody>
        </Card>
    );
};
