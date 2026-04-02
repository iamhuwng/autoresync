import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { studentTokens } from '../layout/studentLayoutStyles';

// ── Color palette for test categories ──
const CATEGORY_COLORS = {
    all: '#4c5458',
    reading: '#2e7d6f',
    listening: '#5b6abf',
    writing: '#c77a2e',
    speaking: '#b94a9a',
    homework: '#9a6427',
    class_session: '#3a7bbd',
    self_study: '#6b8e4e',
    quiz: '#7e57c2',
    test: '#2e7d6f',
    'thcs-test': '#e06850',
};

const CATEGORY_LABELS = {
    all: 'All Tests',
    reading: 'Reading',
    listening: 'Listening',
    writing: 'Writing',
    speaking: 'Speaking',
    homework: 'Homework',
    class_session: 'Class Session',
    self_study: 'Self Study',
    quiz: 'Quiz',
    test: 'Test',
    'thcs-test': 'THCS Test',
};

function ChevronDown() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 9l6 6 6-6" />
        </svg>
    );
}

/**
 * Draws a smooth line chart on a canvas element.
 */
function drawChart(canvas, dataPoints, color, hoveredIndex) {
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth;
    const H = canvas.clientHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, W, H);

    if (dataPoints.length === 0) return;

    const padL = 36;
    const padR = 16;
    const padT = 16;
    const padB = 44;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    // Y-axis grid lines (0%, 25%, 50%, 75%, 100%)
    ctx.strokeStyle = '#ecedf0';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (let pct = 0; pct <= 100; pct += 25) {
        const y = padT + chartH - (pct / 100) * chartH;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(padL + chartW, y);
        ctx.stroke();
    }
    ctx.setLineDash([]);

    // Y-axis labels
    ctx.fillStyle = '#9ea3a9';
    ctx.font = '600 9px Inter, system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let pct = 0; pct <= 100; pct += 25) {
        const y = padT + chartH - (pct / 100) * chartH;
        ctx.fillText(`${pct}%`, padL - 8, y);
    }

    const n = dataPoints.length;
    const stepX = n > 1 ? chartW / (n - 1) : 0;

    // Map data to pixel coordinates
    const points = dataPoints.map((d, i) => ({
        x: padL + i * stepX,
        y: padT + chartH - (d.percentage / 100) * chartH,
        ...d,
    }));

    // Gradient fill under the line
    const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
    grad.addColorStop(0, color + '28');
    grad.addColorStop(1, color + '04');

    ctx.beginPath();
    ctx.moveTo(points[0].x, padT + chartH);
    ctx.lineTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        // Smooth cubic bezier
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
    }
    ctx.lineTo(points[points.length - 1].x, padT + chartH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        const prev = points[i - 1];
        const curr = points[i];
        const cpx = (prev.x + curr.x) / 2;
        ctx.bezierCurveTo(cpx, prev.y, cpx, curr.y, curr.x, curr.y);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Data points
    points.forEach((p, i) => {
        const isHovered = i === hoveredIndex;
        const radius = isHovered ? 6 : 4;

        // White outer ring
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius + 2, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();

        // Colored dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        if (isHovered) {
            ctx.strokeStyle = color + '40';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius + 4, 0, Math.PI * 2);
            ctx.stroke();
        }
    });

    // X-axis labels (test dates)
    ctx.fillStyle = '#9ea3a9';
    ctx.font = '600 8.5px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    points.forEach((p) => {
        ctx.fillText(p.dateLabel, p.x, padT + chartH + 10);
    });
}

export default function RecentGradesChart({
    testResults = [],
    availableCategories = [],
}) {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [hoveredIndex, setHoveredIndex] = useState(-1);
    const [dropdownOpen, setDropdownOpen] = useState(false);
    const [tooltipData, setTooltipData] = useState(null);
    const dropdownRef = useRef(null);

    // Close dropdown on outside click
    useEffect(() => {
        if (!dropdownOpen) return;
        const handleClick = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                setDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [dropdownOpen]);

    // Filter and sort results
    const chartData = useMemo(() => {
        let filtered = testResults;

        if (selectedCategory !== 'all') {
            filtered = testResults.filter(r =>
                r.testSkill === selectedCategory
                || r.testType === selectedCategory
                || r.contextType === selectedCategory
            );
        }

        // Sort by submittedAt ascending, take LAST 10
        const sorted = [...filtered]
            .filter(r => typeof r.percentage === 'number' && typeof r.submittedAt === 'number')
            .sort((a, b) => a.submittedAt - b.submittedAt)
            .slice(-10);

        return sorted.map(r => ({
            percentage: Math.round(r.percentage * 10) / 10,
            dateLabel: new Date(r.submittedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
            testTitle: r.testTitle || 'Test',
            testSkill: r.testSkill,
            testType: r.testType,
            submittedAt: r.submittedAt,
        }));
    }, [testResults, selectedCategory]);

    const activeColor = CATEGORY_COLORS[selectedCategory] || CATEGORY_COLORS.all;

    // Draw chart
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        drawChart(canvas, chartData, activeColor, hoveredIndex);
    }, [chartData, activeColor, hoveredIndex]);

    // Resize observer
    useEffect(() => {
        const container = containerRef.current;
        const canvas = canvasRef.current;
        if (!container || !canvas) return;

        const ro = new ResizeObserver(() => {
            drawChart(canvas, chartData, activeColor, hoveredIndex);
        });
        ro.observe(container);
        return () => ro.disconnect();
    }, [chartData, activeColor, hoveredIndex]);

    // Mouse interaction for hover tooltips
    const handleMouseMove = useCallback((e) => {
        const canvas = canvasRef.current;
        if (!canvas || chartData.length === 0) return;

        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;

        const padL = 36;
        const padR = 16;
        const chartW = rect.width - padL - padR;
        const n = chartData.length;
        const stepX = n > 1 ? chartW / (n - 1) : 0;

        let closest = -1;
        let minDist = 30;
        for (let i = 0; i < n; i++) {
            const px = padL + i * stepX;
            const dist = Math.abs(mx - px);
            if (dist < minDist) {
                minDist = dist;
                closest = i;
            }
        }

        setHoveredIndex(closest);
        if (closest >= 0) {
            const d = chartData[closest];
            const px = padL + closest * stepX;
            setTooltipData({
                x: px,
                title: d.testTitle,
                pct: d.percentage,
                skill: d.testSkill,
                date: d.dateLabel,
            });
        } else {
            setTooltipData(null);
        }
    }, [chartData]);

    const handleMouseLeave = useCallback(() => {
        setHoveredIndex(-1);
        setTooltipData(null);
    }, []);

    const hasData = chartData.length > 0;

    return (
        <div style={styles.wrapper}>
            {/* Header */}
            <div style={styles.header}>
                <h3 style={styles.title}>Recent Grades</h3>
                <div ref={dropdownRef} style={styles.dropdownWrap}>
                    <button
                        type="button"
                        style={styles.dropdownTrigger}
                        onClick={() => setDropdownOpen(prev => !prev)}
                        aria-haspopup="listbox"
                        aria-expanded={dropdownOpen}
                    >
                        <span style={{ color: CATEGORY_COLORS[selectedCategory] || '#4c5458' }}>●</span>
                        {' '}
                        {CATEGORY_LABELS[selectedCategory] || 'All Tests'}
                        <ChevronDown />
                    </button>
                    {dropdownOpen && (
                        <ul style={styles.dropdownList} role="listbox">
                            <li
                                role="option"
                                aria-selected={selectedCategory === 'all'}
                                style={{
                                    ...styles.dropdownItem,
                                    ...(selectedCategory === 'all' ? styles.dropdownItemActive : {}),
                                }}
                                onClick={() => { setSelectedCategory('all'); setDropdownOpen(false); }}
                            >
                                <span style={{ color: CATEGORY_COLORS.all }}>●</span> All Tests
                            </li>
                            {availableCategories.map(cat => (
                                <li
                                    key={cat}
                                    role="option"
                                    aria-selected={selectedCategory === cat}
                                    style={{
                                        ...styles.dropdownItem,
                                        ...(selectedCategory === cat ? styles.dropdownItemActive : {}),
                                    }}
                                    onClick={() => { setSelectedCategory(cat); setDropdownOpen(false); }}
                                >
                                    <span style={{ color: CATEGORY_COLORS[cat] || '#4c5458' }}>●</span>
                                    {' '}
                                    {CATEGORY_LABELS[cat] || cat}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {/* Chart */}
            <div ref={containerRef} style={styles.chartContainer}>
                {hasData ? (
                    <>
                        <canvas
                            ref={canvasRef}
                            style={styles.canvas}
                            onMouseMove={handleMouseMove}
                            onMouseLeave={handleMouseLeave}
                        />
                        {tooltipData && (
                            <div
                                style={{
                                    ...styles.tooltip,
                                    left: Math.min(Math.max(tooltipData.x, 60), containerRef.current?.clientWidth - 80 || 300),
                                }}
                            >
                                <p style={styles.tooltipTitle}>{tooltipData.title.length > 28 ? tooltipData.title.slice(0, 26) + '…' : tooltipData.title}</p>
                                <p style={styles.tooltipScore}>{tooltipData.pct}%</p>
                                <p style={styles.tooltipMeta}>{tooltipData.skill} · {tooltipData.date}</p>
                            </div>
                        )}
                    </>
                ) : (
                    <div style={styles.emptyState}>
                        <p style={styles.emptyText}>No test data available{selectedCategory !== 'all' ? ` for ${CATEGORY_LABELS[selectedCategory]}` : ''}</p>
                    </div>
                )}
            </div>
        </div>
    );
}

const styles = {
    wrapper: {
        padding: '0 0 8px',
    },
    header: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 0 12px',
        borderTop: `1px solid ${studentTokens.borderWhisper}`,
    },
    title: {
        margin: 0,
        fontSize: '0.8125rem',
        fontWeight: 700,
        letterSpacing: '-0.01em',
        color: studentTokens.textPrimary,
    },
    dropdownWrap: {
        position: 'relative',
    },
    dropdownTrigger: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 10px',
        fontSize: '0.6875rem',
        fontWeight: 600,
        color: '#555a5f',
        background: '#f6f7f8',
        border: '1px solid #e4e5e9',
        borderRadius: 6,
        cursor: 'pointer',
        transition: 'border-color 0.15s',
        letterSpacing: '0.02em',
    },
    dropdownList: {
        position: 'absolute',
        top: 'calc(100% + 4px)',
        right: 0,
        zIndex: 20,
        margin: 0,
        padding: '4px 0',
        listStyle: 'none',
        background: '#fff',
        border: '1px solid #e4e5e9',
        borderRadius: 8,
        boxShadow: '0 6px 20px rgba(0,0,0,0.10)',
        minWidth: 160,
        maxHeight: 280,
        overflowY: 'auto',
    },
    dropdownItem: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '7px 14px',
        fontSize: '0.6875rem',
        fontWeight: 500,
        color: '#4c5458',
        cursor: 'pointer',
        transition: 'background 0.12s',
        whiteSpace: 'nowrap',
    },
    dropdownItemActive: {
        background: '#f0f1f4',
        fontWeight: 700,
    },
    chartContainer: {
        position: 'relative',
        width: '100%',
        height: 200,
    },
    canvas: {
        display: 'block',
        width: '100%',
        height: '100%',
        cursor: 'crosshair',
    },
    tooltip: {
        position: 'absolute',
        top: -4,
        transform: 'translateX(-50%)',
        background: '#1e2124',
        color: '#fff',
        padding: '8px 12px',
        borderRadius: 8,
        pointerEvents: 'none',
        zIndex: 10,
        minWidth: 100,
        textAlign: 'center',
        boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
    },
    tooltipTitle: {
        margin: 0,
        fontSize: '0.625rem',
        fontWeight: 600,
        opacity: 0.8,
        whiteSpace: 'nowrap',
    },
    tooltipScore: {
        margin: '2px 0 0',
        fontSize: '1rem',
        fontWeight: 800,
    },
    tooltipMeta: {
        margin: '2px 0 0',
        fontSize: '0.5625rem',
        opacity: 0.6,
        textTransform: 'capitalize',
    },
    emptyState: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        minHeight: 160,
    },
    emptyText: {
        margin: 0,
        fontSize: '0.75rem',
        color: '#9ea3a9',
        fontWeight: 500,
    },
};
