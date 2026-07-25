'use client';
import React from 'react';
import { dashboardKPIs, projects, notifications, costCodes } from '@/lib/data';
import { KpiCard } from '@/components/ui/KpiCard';
import { StatusPill } from '@/components/ui/StatusPill';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { 
  IconBriefcase, 
  IconCash, 
  IconChartBar, 
  IconReportMoney,
  IconBell,
  IconAlertTriangle,
  IconInfoCircle,
  IconCheck
} from '@tabler/icons-react';

export default function DashboardPage() {
  const formatCurrency = (val: number) => {
    return `ETB ${(val / 1000000).toFixed(0)}M`;
  };

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto">
      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        <KpiCard 
          title="Active Projects" 
          value={dashboardKPIs.activeProjects} 
          icon={<IconBriefcase size={24} />} 
        />
        <KpiCard 
          title="Total Contract Value" 
          value={formatCurrency(dashboardKPIs.totalContractValue)} 
          icon={<IconCash size={24} />} 
        />
        <KpiCard 
          title="Avg Completion" 
          value={`${dashboardKPIs.avgCompletion}%`} 
          icon={<IconChartBar size={24} />} 
          trend={{ value: '+2.4%', isPositive: true }}
        />
        <KpiCard 
          title="Budget Consumed" 
          value={`${dashboardKPIs.budgetConsumed}%`} 
          icon={<IconReportMoney size={24} />} 
          trend={{ value: '+5.1%', isPositive: false }}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Project Status List */}
        <div className="lg:col-span-2 bg-ecms-card border border-ecms-border rounded-xl p-5">
          <h2 className="text-base font-semibold text-ecms-text mb-4">Project Status</h2>
          <div className="flex flex-col gap-4">
            {projects.map(p => (
              <div key={p.id} className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-4 rounded-lg bg-ecms-bg border border-ecms-border/50">
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-2">
                    <div>
                      <h3 className="font-medium text-ecms-text">{p.name}</h3>
                      <p className="text-xs text-ecms-muted">{p.client}</p>
                    </div>
                    <StatusPill status={p.status} />
                  </div>
                  <ProgressBar 
                    progress={p.progress} 
                    colorClass={p.status === 'Delayed' || p.status === 'At Risk' ? 'bg-ecms-danger' : 'bg-ecms-success'} 
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Notifications Panel */}
        <div className="bg-ecms-card border border-ecms-border rounded-xl p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-ecms-text">Recent Notifications</h2>
            <IconBell size={18} className="text-ecms-muted" />
          </div>
          <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
            {notifications.map(n => (
              <div key={n.id} className="flex gap-3 items-start p-3 rounded-lg bg-ecms-bg border border-ecms-border/50">
                <div className="mt-0.5">
                  {n.type === 'alert' && <IconAlertTriangle size={16} className="text-ecms-danger" />}
                  {n.type === 'info' && <IconInfoCircle size={16} className="text-ecms-info" />}
                  {n.type === 'success' && <IconCheck size={16} className="text-ecms-success" />}
                </div>
                <div className="flex-1">
                  <p className="text-sm text-ecms-text leading-snug">{n.text}</p>
                  <span className="text-[11px] text-ecms-muted mt-1 inline-block">{n.time}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Budget vs Actual (Using costCodes as example) */}
      <div className="bg-ecms-card border border-ecms-border rounded-xl p-5">
        <h2 className="text-base font-semibold text-ecms-text mb-4">Budget vs Actual (Bole Tower)</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
          {costCodes.map(code => {
            const pct = (code.actual / code.budget) * 100;
            const colorClass = pct > 90 ? 'bg-ecms-danger' : pct > 75 ? 'bg-ecms-amber' : pct < 20 ? 'bg-ecms-info' : 'bg-ecms-success';
            return (
              <div key={code.name} className="flex flex-col gap-1.5">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-ecms-text">{code.name}</span>
                  <span className="text-ecms-muted">{code.actual}M / {code.budget}M</span>
                </div>
                <div className="h-2 w-full bg-ecms-elevated rounded-full overflow-hidden">
                  <div 
                    className={`h-full rounded-full ${colorClass}`} 
                    style={{ width: `${Math.min(pct, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
