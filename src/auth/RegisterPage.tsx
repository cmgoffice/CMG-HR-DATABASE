import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Mail, Lock, User, Briefcase, AlertCircle, Loader2 } from 'lucide-react';

export const RegisterPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [position, setPosition] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { registerWithEmail } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const profile = await registerWithEmail(email, password, firstName, lastName, position);
      if (profile?.status === 'approved') {
        navigate('/dashboard');
      } else {
        navigate('/pending');
      }
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('อีเมลนี้ถูกใช้งานแล้ว');
      } else if (err.code === 'auth/weak-password') {
        setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร');
      } else {
        setError('เกิดข้อผิดพลาดในการลงทะเบียน: ' + err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans items-center justify-center p-4">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl overflow-hidden flex flex-col">
        <div className="bg-slate-900 p-8 text-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-full bg-blue-900/30 z-0"></div>
          <div className="relative z-10">
            <h2 className="text-3xl font-bold text-white mb-2">สมัครใช้งานระบบ</h2>
            <p className="text-blue-200">ระบบจัดการฐานข้อมูลพนักงาน HR</p>
          </div>
        </div>
        
        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg flex items-start gap-3">
              <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
          
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">ชื่อจริง</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">นามสกุล</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                    required
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">ตำแหน่ง</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Briefcase className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  value={position}
                  onChange={(e) => setPosition(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                  required
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password (อย่างน้อย 6 ตัวอักษร)</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                  required
                  minLength={6}
                />
              </div>
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition-all shadow-md mt-6 flex justify-center items-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : 'ลงทะเบียน'}
            </button>
          </form>
          
          <p className="mt-6 text-center text-sm text-gray-600">
            มีบัญชีอยู่แล้ว? <Link to="/login" className="text-blue-600 hover:text-blue-800 font-semibold transition-colors">เข้าสู่ระบบ</Link>
          </p>
        </div>
      </div>
    </div>
  );
};
