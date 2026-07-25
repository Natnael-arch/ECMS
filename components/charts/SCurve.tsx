'use client';
import React from 'react';
import { sCurveData } from '@/lib/data';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';

export function SCurve() {
  return (
    <div className="bg-ecms-card border border-ecms-border rounded-xl p-5 w-full h-[400px]">
      <h3 className="text-sm font-medium text-ecms-muted mb-4">Cumulative Progress (S-Curve)</h3>
      <div className="w-full h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={sCurveData}
            margin={{ top: 5, right: 20, left: -20, bottom: 5 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis 
              dataKey="month" 
              stroke="#8BA3BE" 
              fontSize={12} 
              tickLine={false} 
              axisLine={false}
              dy={10}
            />
            <YAxis 
              stroke="#8BA3BE" 
              fontSize={12} 
              tickLine={false} 
              axisLine={false}
              dx={-10}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#162537', borderColor: 'rgba(255,255,255,0.07)', borderRadius: '8px' }}
              itemStyle={{ color: '#F0F4F8' }}
            />
            <Legend wrapperStyle={{ paddingTop: '20px', fontSize: '12px' }} />
            <Line 
              type="monotone" 
              name="Planned Progress"
              dataKey="planned" 
              stroke="#378ADD" 
              strokeWidth={3}
              strokeDasharray="5 5"
              dot={false}
              activeDot={{ r: 6 }}
            />
            <Line 
              type="monotone" 
              name="Actual Progress"
              dataKey="actual" 
              stroke="#F5A623" 
              strokeWidth={3}
              dot={{ fill: '#F5A623', strokeWidth: 2, r: 4, stroke: '#162537' }}
              activeDot={{ r: 6, stroke: '#162537', strokeWidth: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
