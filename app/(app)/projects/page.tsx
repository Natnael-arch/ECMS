'use client';
import React, { useState } from 'react';
import { projects } from '@/lib/data';
import { StatusPill } from '@/components/ui/StatusPill';
import { IconChevronRight, IconBuildingFactory, IconCalendarStats, IconUsers } from '@tabler/icons-react';

export default function ProjectsPage() {
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0].id);
  const selectedProject = projects.find(p => p.id === selectedProjectId) || projects[0];

  const milestones = [
    { label: "Foundation complete",      status: "done",        date: null },
    { label: "Superstructure to 6F",     status: "done",        date: null },
    { label: "Superstructure to 12F",    status: "in-progress", date: "Oct 2026" },
    { label: "MEP rough-in",             status: "upcoming",    date: "Nov 2026" },
    { label: "Finishing and handover",   status: "upcoming",    date: "Dec 2026" },
  ];

  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto h-full">
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        
        {/* Project Register Table */}
        <div className="xl:col-span-2 bg-ecms-card border border-ecms-border rounded-xl flex flex-col overflow-hidden">
          <div className="p-5 border-b border-ecms-border">
            <h2 className="text-base font-semibold text-ecms-text">Project Register</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-ecms-text">
              <thead className="bg-ecms-elevated/50 text-ecms-muted text-xs uppercase">
                <tr>
                  <th className="px-5 py-3 font-medium">Project Name</th>
                  <th className="px-5 py-3 font-medium">Client</th>
                  <th className="px-5 py-3 font-medium">Value (ETB)</th>
                  <th className="px-5 py-3 font-medium">Timeline</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ecms-border">
                {projects.map(p => (
                  <tr 
                    key={p.id} 
                    className={`hover:bg-ecms-elevated/30 transition-colors cursor-pointer ${selectedProjectId === p.id ? 'bg-ecms-elevated/20' : ''}`}
                    onClick={() => setSelectedProjectId(p.id)}
                  >
                    <td className="px-5 py-4 font-medium">{p.name}</td>
                    <td className="px-5 py-4 text-ecms-muted">{p.client}</td>
                    <td className="px-5 py-4">{(p.contractValue / 1000000).toFixed(1)}M</td>
                    <td className="px-5 py-4 text-ecms-muted">{p.startDate} - {p.endDate}</td>
                    <td className="px-5 py-4">
                      <StatusPill status={p.status} />
                    </td>
                    <td className="px-5 py-4 text-right">
                      <button className="text-ecms-amber hover:text-white transition-colors">
                        <IconChevronRight size={20} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Project Detail Panel */}
        <div className="flex flex-col gap-6">
          {/* Profile Card */}
          <div className="bg-ecms-card border border-ecms-border rounded-xl p-5">
            <h2 className="text-xl font-bold text-ecms-text mb-1">{selectedProject.name}</h2>
            <p className="text-sm text-ecms-muted mb-6">{selectedProject.client}</p>

            <div className="flex flex-col gap-4 text-sm">
              <div className="flex items-start gap-3">
                <IconBuildingFactory size={20} className="text-ecms-amber shrink-0 mt-0.5" />
                <div>
                  <p className="text-ecms-muted text-xs">Project Type</p>
                  <p className="font-medium text-ecms-text">{selectedProject.type}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <IconCalendarStats size={20} className="text-ecms-amber shrink-0 mt-0.5" />
                <div>
                  <p className="text-ecms-muted text-xs">Contract Details</p>
                  <p className="font-medium text-ecms-text">{selectedProject.contractType} · ETB {(selectedProject.contractValue / 1000000).toFixed(1)}M</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <IconUsers size={20} className="text-ecms-amber shrink-0 mt-0.5" />
                <div className="flex flex-col gap-2 w-full">
                  <div>
                    <p className="text-ecms-muted text-xs">Project Manager</p>
                    <p className="font-medium text-ecms-text">{selectedProject.projectManager || selectedProject.pm}</p>
                  </div>
                  <div>
                    <p className="text-ecms-muted text-xs">Site Supervisor</p>
                    <p className="font-medium text-ecms-text">{selectedProject.supervisor}</p>
                  </div>
                  <div>
                    <p className="text-ecms-muted text-xs">Consultant</p>
                    <p className="font-medium text-ecms-text">{selectedProject.consultant}</p>
                  </div>
                  {selectedProject.contractor && (
                    <div>
                      <p className="text-ecms-muted text-xs">Contractor</p>
                      <p className="font-medium text-ecms-text">{selectedProject.contractor}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Milestone Tracker */}
          <div className="bg-ecms-card border border-ecms-border rounded-xl p-5 flex-1">
            <h2 className="text-base font-semibold text-ecms-text mb-4">Milestone Tracker</h2>
            <div className="relative pl-4 border-l-2 border-ecms-border ml-2 flex flex-col gap-6">
              {milestones.map((m, i) => (
                <div key={i} className="relative">
                  <div className={`absolute -left-[23px] top-1 w-3 h-3 rounded-full border-2 ${
                    m.status === 'done' ? 'bg-ecms-success border-ecms-success' : 
                    m.status === 'in-progress' ? 'bg-ecms-amber border-ecms-amber shadow-[0_0_8px_rgba(245,166,35,0.5)]' : 
                    'bg-ecms-elevated border-ecms-border'
                  }`} />
                  <div>
                    <p className={`font-medium text-sm ${m.status === 'upcoming' ? 'text-ecms-muted' : 'text-ecms-text'}`}>{m.label}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {m.date && <span className="text-xs text-ecms-muted">{m.date}</span>}
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                        m.status === 'done' ? 'bg-ecms-success/10 text-ecms-success' : 
                        m.status === 'in-progress' ? 'bg-ecms-amber/10 text-ecms-amber' : 
                        'bg-ecms-elevated text-ecms-muted'
                      }`}>
                        {m.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}
