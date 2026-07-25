'use client';
import React from 'react';
import { documents } from '@/lib/data';
import { StatusPill } from '@/components/ui/StatusPill';
import { AlertStrip } from '@/components/ui/AlertStrip';
import { IconFileTypePdf, IconUpload, IconDownload, IconEye } from '@tabler/icons-react';

export default function DocumentsPage() {
  return (
    <div className="flex flex-col gap-6 max-w-7xl mx-auto h-full">
      <AlertStrip 
        message="Site users only see current drawings. Superseded versions are locked automatically." 
        type="success" 
      />

      <div className="bg-ecms-card border border-ecms-border rounded-xl flex flex-col overflow-hidden">
        <div className="p-5 border-b border-ecms-border flex justify-between items-center">
          <h2 className="text-base font-semibold text-ecms-text">Drawing Register</h2>
          <button className="flex items-center gap-2 bg-ecms-elevated border border-ecms-border-strong hover:bg-ecms-amber hover:text-ecms-navy hover:border-ecms-amber text-ecms-text text-sm font-medium px-4 py-2 rounded-lg transition-colors">
            <IconUpload size={18} />
            <span>Upload Document</span>
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-ecms-text">
            <thead className="bg-ecms-elevated/50 text-ecms-muted text-xs uppercase">
              <tr>
                <th className="px-5 py-3 font-medium w-[60px]">Type</th>
                <th className="px-5 py-3 font-medium">Document Number</th>
                <th className="px-5 py-3 font-medium text-center">Revision</th>
                <th className="px-5 py-3 font-medium">Issue Date</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ecms-border">
              {documents.map(d => (
                <tr key={d.id} className="hover:bg-ecms-elevated/30 transition-colors">
                  <td className="px-5 py-4">
                    <IconFileTypePdf size={24} className={d.status === 'superseded' ? 'text-ecms-muted' : 'text-ecms-danger'} stroke={1.5} />
                  </td>
                  <td className="px-5 py-4 font-medium">
                    {d.number}
                    <span className="text-ecms-muted ml-3 font-normal">{d.title}</span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className="bg-ecms-elevated text-ecms-text px-2 py-1 rounded text-xs">{d.revision}</span>
                  </td>
                  <td className="px-5 py-4 text-ecms-muted">{d.date}</td>
                  <td className="px-5 py-4">
                    <StatusPill status={d.status} />
                  </td>
                  <td className="px-5 py-4 text-right flex justify-end gap-3">
                    <button 
                      className={`transition-colors ${d.status === 'superseded' ? 'text-ecms-border-strong cursor-not-allowed' : 'text-ecms-muted hover:text-ecms-text'}`}
                      disabled={d.status === 'superseded'}
                    >
                      <IconEye size={18} />
                    </button>
                    <button 
                      className={`transition-colors ${d.status === 'superseded' ? 'text-ecms-border-strong cursor-not-allowed' : 'text-ecms-muted hover:text-ecms-amber'}`}
                      disabled={d.status === 'superseded'}
                    >
                      <IconDownload size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
