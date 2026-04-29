import React from 'react';
import { useAuth } from './AuthContext';
import { Clock, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export const PendingApprovalPage = () => {
  const { userProfile, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 p-4 font-sans">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden text-center p-10">
        <div className="w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <Clock size={48} className="text-orange-500" />
        </div>
        
        <h2 className="text-2xl font-bold text-gray-900 mb-3">รอการอนุมัติ</h2>
        
        <p className="text-gray-600 mb-8 leading-relaxed">
          สวัสดีคุณ <span className="font-semibold">{userProfile?.firstName}</span><br />
          บัญชีของคุณอยู่ในสถานะรอการอนุมัติจากผู้ดูแลระบบ กรุณารอการติดต่อกลับหรือตรวจสอบอีกครั้งในภายหลัง
        </p>
        
        <button
          onClick={handleLogout}
          className="flex items-center justify-center gap-2 w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-3 px-4 rounded-xl transition-colors"
        >
          <LogOut size={20} /> ออกจากระบบ
        </button>
      </div>
    </div>
  );
};
