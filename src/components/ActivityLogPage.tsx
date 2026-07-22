import React, { useState, useEffect } from 'react';
import { getFirestore, collection, query, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import { Activity, Loader2, Filter, Calendar, User, FileText, Search, Megaphone } from 'lucide-react';
import { InfoTooltip } from './InfoTooltip';
import { WhatsNewBacklogTab } from './WhatsNewBacklogTab';

interface LogRecord {
  id: string;
  timestamp: string;
  user: string;
  module: string;
  action: string;
  details: string;
  createdAt: number;
}

export const ActivityLogPage = () => {
  const { hasRole, userProfile } = useAuth();
  const [tab, setTab] = useState<'logs' | 'whats_new_backlog'>('logs');
  const [logs, setLogs] = useState<LogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterModule, setFilterModule] = useState<string>('all');
  const [filterAction, setFilterAction] = useState<string>('all');
  const db = getFirestore();

  useEffect(() => {
    // Realtime listener for activity logs
    const q = query(
      collection(db, "CMG-HR-Database", "root", "activity_logs"),
      orderBy("createdAt", "desc"),
      limit(500) // จำกัดแสดง 500 รายการล่าสุด
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as LogRecord));
      setLogs(logsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [db]);

  // Get unique modules and actions for filters
  const uniqueModules = Array.from(new Set(logs.map(log => log.module))).sort();
  const uniqueActions = Array.from(new Set(logs.map(log => log.action))).sort();

  // Filter logs
  const filteredLogs = logs.filter(log => {
    const matchesSearch = searchQuery === '' || 
      log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.module.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.details.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesModule = filterModule === 'all' || log.module === filterModule;
    const matchesAction = filterAction === 'all' || log.action === filterAction;

    return matchesSearch && matchesModule && matchesAction;
  });

  // Get action badge color
  const getActionBadgeColor = (action: string): string => {
    const actionLower = action.toLowerCase();
    if (actionLower.includes('เพิ่ม') || actionLower.includes('add') || actionLower.includes('register')) {
      return 'bg-green-100 text-green-700 border border-green-300';
    } else if (actionLower.includes('แก้ไข') || actionLower.includes('edit') || actionLower.includes('update')) {
      return 'bg-blue-100 text-blue-700 border border-blue-300';
    } else if (actionLower.includes('ลบ') || actionLower.includes('delete')) {
      return 'bg-red-100 text-red-700 border border-red-300';
    } else if (actionLower.includes('login')) {
      return 'bg-purple-100 text-purple-700 border border-purple-300';
    } else if (actionLower.includes('import') || actionLower.includes('export')) {
      return 'bg-amber-100 text-amber-700 border border-amber-300';
    }
    return 'bg-gray-100 text-gray-700 border border-gray-300';
  };

  // Get module badge color
  const getModuleBadgeColor = (module: string): string => {
    const colors: Record<string, string> = {
      'Authentication': 'bg-purple-50 text-purple-700 border border-purple-200',
      'User Management': 'bg-indigo-50 text-indigo-700 border border-indigo-200',
      'projects': 'bg-emerald-50 text-emerald-700 border border-emerald-200',
      'employee_data': 'bg-blue-50 text-blue-700 border border-blue-200',
      'emp_indirect': 'bg-cyan-50 text-cyan-700 border border-cyan-200',
      'emp_direct_leader': 'bg-teal-50 text-teal-700 border border-teal-200',
      'emp_direct_supply': 'bg-orange-50 text-orange-700 border border-orange-200',
      'emp_direct_sub': 'bg-pink-50 text-pink-700 border border-pink-200',
      'position_labor': 'bg-violet-50 text-violet-700 border border-violet-200',
      'attendance': 'bg-rose-50 text-rose-700 border border-rose-200',
    };
    return colors[module] || 'bg-slate-50 text-slate-700 border border-slate-200';
  };

  if (!hasRole(['MasterAdmin', 'MD', 'GM', 'HRM'])) {
    return (
      <div className="p-8 text-center text-red-500 font-bold">
        คุณไม่มีสิทธิ์เข้าถึงหน้านี้
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-2 flex items-center gap-2">
          <Activity className="text-orange-500" /> บันทึกกิจกรรมระบบ (Activity Logs)
          <InfoTooltip content="แสดงข้อมูลจาก activity_logs โดยเรียงตาม createdAt ล่าสุด และจำกัด 500 รายการล่าสุด สถิติด้านล่างคำนวณจากรายการที่ผ่านตัวกรองปัจจุบัน" />
        </h2>
        <p className="text-sm text-gray-600">
          ติดตามการเปลี่ยนแปลงข้อมูลทั้งหมดในระบบ{tab === 'logs' ? ` - แสดง ${filteredLogs.length} จาก ${logs.length} รายการ` : ''}
        </p>
      </div>

      <div className="mb-4 flex items-center gap-1 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab('logs')}
          className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-semibold ${
            tab === 'logs' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Activity size={15} />
          บันทึกกิจกรรม
        </button>
        <button
          type="button"
          onClick={() => setTab('whats_new_backlog')}
          className={`-mb-px flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-semibold ${
            tab === 'whats_new_backlog' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Megaphone size={15} />
          Backlog ประกาศ
        </button>
      </div>

      {tab === 'whats_new_backlog' ? (
        <WhatsNewBacklogTab />
      ) : (
        <>
      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="ค้นหา..."
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none text-sm"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          {/* Module Filter */}
          <div className="relative">
            <FileText className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <select
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none text-sm appearance-none bg-white"
              value={filterModule}
              onChange={(e) => setFilterModule(e.target.value)}
            >
              <option value="all">ทุก Module</option>
              {uniqueModules.map(module => (
                <option key={module} value={module}>{module}</option>
              ))}
            </select>
          </div>

          {/* Action Filter */}
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <select
              className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-100 outline-none text-sm appearance-none bg-white"
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
            >
              <option value="all">ทุกกิจกรรม</option>
              {uniqueActions.map(action => (
                <option key={action} value={action}>{action}</option>
              ))}
            </select>
          </div>

          {/* Clear Filters */}
          <button
            onClick={() => {
              setSearchQuery('');
              setFilterModule('all');
              setFilterAction('all');
            }}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 text-sm font-medium transition-colors"
          >
            ล้างตัวกรอง
          </button>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Activity size={48} className="mx-auto mb-4 opacity-50" />
            <p>ไม่พบข้อมูล Activity Log</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase font-semibold">
                <tr>
                  <th className="px-4 py-3 w-14 text-center">#</th>
                  <th className="px-4 py-3 w-40">
                    <div className="flex items-center gap-2">
                      <Calendar size={14} />
                      เวลา
                    </div>
                  </th>
                  <th className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <User size={14} />
                      ผู้ใช้
                    </div>
                  </th>
                  <th className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText size={14} />
                      Module
                    </div>
                  </th>
                  <th className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Activity size={14} />
                      กิจกรรม
                    </div>
                  </th>
                  <th className="px-4 py-3">รายละเอียด</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
                {filteredLogs.map((log, idx) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-center text-gray-500 font-medium">
                      {idx + 1}
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                      {log.timestamp}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 font-bold text-xs">
                          {log.user.charAt(0).toUpperCase()}
                        </div>
                        <span className="font-medium">{log.user}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getModuleBadgeColor(log.module)}`}>
                        {log.module}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getActionBadgeColor(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {log.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary Stats */}
      {!loading && filteredLogs.length > 0 && (
        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="text-green-700 text-sm font-semibold mb-1">การเพิ่มข้อมูล</div>
            <div className="text-2xl font-bold text-green-800">
              {filteredLogs.filter(log => log.action.toLowerCase().includes('เพิ่ม') || log.action.toLowerCase().includes('add')).length}
            </div>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="text-blue-700 text-sm font-semibold mb-1">การแก้ไข</div>
            <div className="text-2xl font-bold text-blue-800">
              {filteredLogs.filter(log => log.action.toLowerCase().includes('แก้ไข') || log.action.toLowerCase().includes('edit')).length}
            </div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="text-red-700 text-sm font-semibold mb-1">การลบข้อมูล</div>
            <div className="text-2xl font-bold text-red-800">
              {filteredLogs.filter(log => log.action.toLowerCase().includes('ลบ') || log.action.toLowerCase().includes('delete')).length}
            </div>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
            <div className="text-purple-700 text-sm font-semibold mb-1">การเข้าสู่ระบบ</div>
            <div className="text-2xl font-bold text-purple-800">
              {filteredLogs.filter(log => log.action.toLowerCase().includes('login')).length}
            </div>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
};
