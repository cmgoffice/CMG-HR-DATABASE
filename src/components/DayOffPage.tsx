import React, { useState, useEffect } from 'react';
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, query, orderBy } from 'firebase/firestore';
import { useAuth } from '../auth/AuthContext';
import { Calendar, Plus, Trash2, Edit, Loader2, Save, X } from 'lucide-react';

interface DayOff {
  id: string;      // YYYY-MM-DD
  date: string;    // YYYY-MM-DD
  name: string;
  createdAt: number;
}

export const DayOffPage = () => {
  const { hasRole } = useAuth();
  const [dayOffs, setDayOffs] = useState<DayOff[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  
  // Form state
  const [formDate, setFormDate] = useState('');
  const [formName, setFormName] = useState('');
  const [saving, setSaving] = useState(false);

  const db = getFirestore();
  const canEdit = hasRole(['MasterAdmin', 'MD', 'GM', 'HRM', 'HR']);

  useEffect(() => {
    const q = query(collection(db, "CMG-HR-Database", "root", "day_offs"), orderBy("date", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as DayOff));
      setDayOffs(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [db]);

  const openAddModal = () => {
    setFormDate('');
    setFormName('');
    setEditingId(null);
    setIsModalOpen(true);
  };

  const openEditModal = (dayOff: DayOff) => {
    setFormDate(dayOff.date);
    setFormName(dayOff.name);
    setEditingId(dayOff.id);
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDate || !formName) return;

    setSaving(true);
    try {
      // If editing and date changed, delete old doc
      if (editingId && editingId !== formDate) {
        await deleteDoc(doc(db, "CMG-HR-Database", "root", "day_offs", editingId));
      }

      const docRef = doc(db, "CMG-HR-Database", "root", "day_offs", formDate);
      await setDoc(docRef, {
        date: formDate,
        name: formName,
        createdAt: Date.now()
      });

      setIsModalOpen(false);
    } catch (err) {
      console.error("Error saving day off:", err);
      alert("เกิดข้อผิดพลาดในการบันทึก");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("คุณแน่ใจหรือไม่ที่จะลบวันหยุดนี้?")) return;
    try {
      await deleteDoc(doc(db, "CMG-HR-Database", "root", "day_offs", id));
    } catch (err) {
      console.error("Error deleting day off:", err);
      alert("เกิดข้อผิดพลาดในการลบ");
    }
  };

  if (!hasRole(['MasterAdmin', 'MD', 'GM', 'HRM', 'HR', 'Admin Site', 'Staff'])) {
    return <div className="p-8 text-center text-red-500 font-bold">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</div>;
  }

  return (
    <div className="p-6 h-full overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Calendar className="text-fuchsia-500" /> จัดการวันหยุดบริษัท (Day Off)
          </h2>
          <p className="text-sm text-gray-600">
            ตั้งค่าวัดหยุดเพื่อให้แสดงผลในหน้าลงเวลาและหน้าลงโอที
          </p>
        </div>
        {canEdit && (
          <button
            onClick={openAddModal}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors"
          >
            <Plus size={18} /> เพิ่มวันหยุด
          </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 flex justify-center">
            <Loader2 className="animate-spin text-blue-500" size={32} />
          </div>
        ) : dayOffs.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Calendar size={48} className="mx-auto mb-4 opacity-50" />
            <p>ยังไม่มีการกำหนดวันหยุด</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs uppercase font-semibold">
              <tr>
                <th className="px-6 py-4 w-40 text-center">วันที่</th>
                <th className="px-6 py-4">ชื่อวันหยุด</th>
                {canEdit && <th className="px-6 py-4 w-32 text-center">จัดการ</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
              {dayOffs.map((d) => (
                <tr key={d.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 text-center font-medium">
                    {new Date(d.date).toLocaleDateString('th-TH', { 
                      year: 'numeric', month: 'short', day: 'numeric' 
                    })}
                  </td>
                  <td className="px-6 py-4 font-medium text-fuchsia-700">
                    {d.name}
                  </td>
                  {canEdit && (
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-3">
                        <button 
                          onClick={() => openEditModal(d)}
                          className="text-blue-500 hover:text-blue-700 hover:bg-blue-50 p-1.5 rounded transition-colors"
                          title="แก้ไข"
                        >
                          <Edit size={16} />
                        </button>
                        <button 
                          onClick={() => handleDelete(d.id)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1.5 rounded transition-colors"
                          title="ลบ"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="flex justify-between items-center p-5 border-b">
              <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                {editingId ? "แก้ไขวันหยุด" : "เพิ่มวันหยุด"}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-red-500 p-1 rounded-full transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSave} className="flex flex-col">
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">วันที่</label>
                  <input
                    type="date"
                    required
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">ชื่อวันหยุด</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น วันปิยมหาราช"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"
                  />
                </div>
              </div>
              
              <div className="p-5 border-t bg-gray-50 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm font-medium transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  บันทึก
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
