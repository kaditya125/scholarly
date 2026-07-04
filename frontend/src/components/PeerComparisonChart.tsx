import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { useTheme } from '../lib/ThemeContext';

interface MockTestData {
  testNumber: number;
  userScore: number;
  communityAverage: number;
}

const mockData: MockTestData[] = [
  { testNumber: 1, userScore: 65, communityAverage: 62 },
  { testNumber: 2, userScore: 70, communityAverage: 65 },
  { testNumber: 3, userScore: 68, communityAverage: 67 },
  { testNumber: 4, userScore: 75, communityAverage: 68 },
  { testNumber: 5, userScore: 82, communityAverage: 71 },
  { testNumber: 6, userScore: 80, communityAverage: 73 },
  { testNumber: 7, userScore: 85, communityAverage: 75 },
  { testNumber: 8, userScore: 88, communityAverage: 76 },
];

export function PeerComparisonChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!chartRef.current) return;

    // Clear previous SVG
    d3.select(chartRef.current).selectAll('*').remove();

    const margin = { top: 20, right: 30, bottom: 40, left: 40 };
    const width = chartRef.current.clientWidth - margin.left - margin.right;
    const height = 300 - margin.top - margin.bottom;

    const svg = d3
      .select(chartRef.current)
      .append('svg')
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    const textColor = theme === 'dark' ? '#94a3b8' : '#64748b';
    const gridColor = theme === 'dark' ? '#334155' : '#e2e8f0';

    const x = d3
      .scaleLinear()
      .domain([1, d3.max(mockData, (d) => d.testNumber)!])
      .range([0, width]);

    const y = d3
      .scaleLinear()
      .domain([0, 100])
      .range([height, 0]);

    // Add Gridlines
    svg.append('g')
      .attr('class', 'grid')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(8).tickSize(-height).tickFormat(() => ''))
      .selectAll('line').style('stroke', gridColor).style('stroke-dasharray', '3,3');

    svg.append('g')
      .attr('class', 'grid')
      .call(d3.axisLeft(y).ticks(5).tickSize(-width).tickFormat(() => ''))
      .selectAll('line').style('stroke', gridColor).style('stroke-dasharray', '3,3');

    svg.selectAll('.domain').remove();

    // Add X axis
    svg
      .append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(x).ticks(8).tickFormat(d => `Test ${d}`))
      .selectAll('text')
      .style('fill', textColor)
      .style('font-size', '12px')
      .style('font-family', 'Inter, sans-serif');

    // Add Y axis
    svg
      .append('g')
      .call(d3.axisLeft(y).ticks(5))
      .selectAll('text')
      .style('fill', textColor)
      .style('font-size', '12px')
      .style('font-family', 'Inter, sans-serif');

    svg.selectAll('.domain, .tick line').remove();

    // User Score Line
    const userLine = d3
      .line<MockTestData>()
      .x((d) => x(d.testNumber))
      .y((d) => y(d.userScore))
      .curve(d3.curveMonotoneX);

    svg
      .append('path')
      .datum(mockData)
      .attr('fill', 'none')
      .attr('stroke', '#0d9488') // Teal-600
      .attr('stroke-width', 3)
      .attr('d', userLine);

    // Community Average Line
    const commLine = d3
      .line<MockTestData>()
      .x((d) => x(d.testNumber))
      .y((d) => y(d.communityAverage))
      .curve(d3.curveMonotoneX);

    svg
      .append('path')
      .datum(mockData)
      .attr('fill', 'none')
      .attr('stroke', '#facc15') // Yellow-400
      .attr('stroke-width', 3)
      .attr('stroke-dasharray', '5,5')
      .attr('d', commLine);

    // Add data points for user score
    svg
      .selectAll('.user-point')
      .data(mockData)
      .enter()
      .append('circle')
      .attr('class', 'user-point')
      .attr('cx', (d) => x(d.testNumber))
      .attr('cy', (d) => y(d.userScore))
      .attr('r', 5)
      .attr('fill', '#0d9488')
      .attr('stroke', theme === 'dark' ? '#1f1f1f' : '#ffffff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseover', (event, d) => {
        d3.select(event.currentTarget).attr('r', 7);
      })
      .on('mouseout', (event) => {
        d3.select(event.currentTarget).attr('r', 5);
      })
      .append('title')
      .text((d) => `Test ${d.testNumber}\nYour Score: ${d.userScore}`);

    // Add data points for community average
    svg
      .selectAll('.comm-point')
      .data(mockData)
      .enter()
      .append('circle')
      .attr('class', 'comm-point')
      .attr('cx', (d) => x(d.testNumber))
      .attr('cy', (d) => y(d.communityAverage))
      .attr('r', 5)
      .attr('fill', '#facc15')
      .attr('stroke', theme === 'dark' ? '#1f1f1f' : '#ffffff')
      .attr('stroke-width', 2)
      .style('cursor', 'pointer')
      .on('mouseover', (event, d) => {
        d3.select(event.currentTarget).attr('r', 7);
      })
      .on('mouseout', (event) => {
        d3.select(event.currentTarget).attr('r', 5);
      })
      .append('title')
      .text((d) => `Test ${d.testNumber}\nCommunity Average: ${d.communityAverage}`);

  }, [theme, chartRef.current?.clientWidth]);

  useEffect(() => {
    const handleResize = () => {
      setTick(t => t + 1);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="w-full flex flex-col items-center">
      <div className="flex items-center gap-6 mb-2 mt-2">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
           <span className="w-3 h-3 rounded-full bg-teal-600"></span>
           Your Score
        </div>
        <div className="flex items-center gap-2 text-[13px] font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wider">
           <span className="w-3 h-3 rounded-full bg-yellow-400 border border-slate-200 dark:border-white/10"></span>
           Community Average
        </div>
      </div>
      <div ref={chartRef} className="w-full h-[300px]" />
    </div>
  );
}
