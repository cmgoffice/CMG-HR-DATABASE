import React, { useState, useEffect } from 'react';
import { getFirestore, collection, query, getDocs, doc, updateDoc, onSnapshot } from 'firebase/firestore';
import { useAuth, UserRole, ALL_ROLES, UserProfile } from '../auth/AuthContext';
import { Loader2, Check, X, Edit, Shield, Mail, CheckCircle, AlertCircle } from 'lucide-react';

export const UserManagement = ({ 
  projectOptions 
}: { 
  projectOptions: string[] 
}) => {
  const { hasRole, userProfile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const db = getFirestore();

  useEffect(() => {
    // Realtime listeners for users
    const q = collection(db, "CMG-HR-Database", "root", "users");
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(doc => doc.data() as UserProfile);
      setUsers(usersData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [db]);

  const handleUpdateUserStatus = async (uid: string, status: 'approved' | 'rejected') => {
    try {
      await updateDoc(doc(db, "CMG-HR-Database", "root", "users", uid), { status });
    } catch (error) {
      console.error("Error updating user status:", error);
    }
  };

  const handleSaveUser = async (user: UserProfile) => {
    try {
      await updateDoc(doc(db, "CMG-HR-Database", "root", "users", user.uid), {
        role: user.role,
        assignedProjects: user.assignedProjects
      });
      setEditingUser(null);
    } catch (error) {
      console.error("Error saving user:", error);
    }
  };

  if (!hasRole(['MasterAdmin'])) {
    return <div className="p-8 text-center text-red-500 font-bold">คุณไม่มีสิทธิ์เข้าถึงหน้านี้</div>;
  }

  return (
    <div className="p-6 h-full overflow-y-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center gap-2">
        <Shield className="text-blue-600" /> จัดการสิทธิ์ผู้ใช้งาน
      </h2>

      {loading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="animate-spin text-blue-500" size={32} />
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-left border-collapse min-w-max">
            <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 text-sm">
              <tr>
                <th className="px-4 py-0.5 font-semibold">ผู้ใช้งาน</th>
                <th className="px-4 py-0.5 font-semibold">อีเมล</th>
                <th className="px-4 py-0.5 font-semibold">ตำแหน่ง</th>
                <th className="px-4 py-0.5 font-semibold">สถานะ</th>
                <th className="px-4 py-0.5 font-semibold">สิทธิ์ (Roles)</th>
                <th className="px-4 py-0.5 font-semibold">โครงการที่รับผิดชอบ</th>
                <th className="px-4 py-0.5 font-semibold text-center">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {users.map((user) => (
                <tr key={user.uid} className="hover:bg-blue-50/50">
                  <td className="px-4 py-0.5">
                    <div className="flex items-center gap-3">
                      {user.photoURL ? (
                        <img src={user.photoURL} alt="Profile" className="w-8 h-8 rounded-full object-cover shadow-sm border border-gray-200" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
                          {user.firstName?.charAt(0) || user.email.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <div className="font-semibold text-gray-800">{user.firstName} {user.lastName}</div>
                        {user.isFirstUser && <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">First User</span>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-0.5 text-gray-600">
                    <div className="flex items-center gap-1.5"><Mail size={14} className="text-gray-400"/> {user.email}</div>
                  </td>
                  <td className="px-4 py-0.5 text-gray-600">{user.position || "-"}</td>
                  <td className="px-4 py-0.5">
                    {user.status === 'pending' ? (
                      <span className="px-2.5 py-0.5 bg-orange-100 text-orange-700 text-xs font-semibold rounded-full border border-orange-200">รออนุมัติ</span>
                    ) : user.status === 'approved' ? (
                      <span className="px-2.5 py-0.5 bg-green-100 text-green-700 text-xs font-semibold rounded-full border border-green-200">อนุมัติแล้ว</span>
                    ) : (
                      <span className="px-2.5 py-0.5 bg-red-100 text-red-700 text-xs font-semibold rounded-full border border-red-200">ปฏิเสธ</span>
                    )}
                  </td>
                  <td className="px-4 py-0.5">
                    <div className="flex flex-wrap gap-1">
                      {user.role.map(r => (
                        <span key={r} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-semibold rounded border border-blue-100">{r}</span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-0.5 text-xs text-gray-500 max-w-[200px] truncate">
                    {user.assignedProjects?.length > 0 ? user.assignedProjects.join(', ') : "ไม่ได้กำหนด"}
                  </td>
                  <td className="px-4 py-0.5 text-center">
                    {user.status === 'pending' ? (
                      <div className="flex justify-center gap-2">
                        <button onClick={() => handleUpdateUserStatus(user.uid, 'approved')} className="p-1 bg-green-50 text-green-600 hover:bg-green-100 rounded-lg" title="อนุมัติ"><CheckCircle size={16} /></button>
                        <button onClick={() => handleUpdateUserStatus(user.uid, 'rejected')} className="p-1 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg" title="ปฏิเสธ"><AlertCircle size={16} /></button>
                      </div>
                    ) : (
                      <button 
                        onClick={() => setEditingUser(user)} 
                        className="p-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg"
                        disabled={user.isFirstUser && user.uid === userProfile?.uid}
                        title="แก้ไขสิทธิ์"
                      >
                        <Edit size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-[90vw] max-w-lg flex flex-col animate-fade-in-up">
            <div className="p-5 border-b flex justify-between items-center">
              <h3 className="text-lg font-bold">แก้ไขข้อมูลผู้ใช้งาน: {editingUser.firstName}</h3>
              <button onClick={() => setEditingUser(null)} className="text-gray-400 hover:text-red-500"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">สิทธิ์การใช้งาน (Roles)</label>
                <div className="relative z-[10010] bg-gray-50 p-4 rounded-lg border">
                  <div className="flex flex-wrap gap-2">
                    {ALL_ROLES.map(role => {
                      const isChecked = editingUser.role.includes(role);
                      const toggle = () => {
                        const newRoles = isChecked ? editingUser.role.filter(r => r !== role) : [...editingUser.role, role];
                        setEditingUser({ ...editingUser, role: newRoles });
                      };
                      return (
                         <label key={role} className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-full border cursor-pointer hover:bg-blue-50">
                            <input type="checkbox" checked={isChecked} onChange={toggle} className="rounded text-blue-600 focus:ring-blue-500" />
                            <span className="text-sm font-medium">{role}</span>
                         </label>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">โครงการที่รับผิดชอบ</label>
                <div className="bg-gray-50 p-4 rounded-lg border max-h-48 overflow-y-auto">
                  <div className="flex flex-col gap-2">
                    {projectOptions.map(project => {
                      const assigned = editingUser.assignedProjects || [];
                      const isChecked = assigned.includes(project);
                      const toggle = () => {
                         const next = isChecked ? assigned.filter(p => p !== project) : [...assigned, project];
                         setEditingUser({ ...editingUser, assignedProjects: next });
                      };
                      return (
                         <label key={project} className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-1.5 rounded">
                            <input type="checkbox" checked={isChecked} onChange={toggle} className="rounded text-emerald-600 focus:ring-emerald-500" />
                            <span className="text-sm">{project}</span>
                         </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
            <div className="p-5 border-t bg-gray-50 rounded-b-xl flex justify-end gap-3">
              <button onClick={() => setEditingUser(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">ยกเลิก</button>
              <button onClick={() => handleSaveUser(editingUser)} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">บันทึกข้อมูล</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
