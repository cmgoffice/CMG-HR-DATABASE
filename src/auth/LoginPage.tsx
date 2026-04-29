import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { Mail, Lock, AlertCircle, Loader2 } from 'lucide-react';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginWithEmail, loginWithGoogle, userProfile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (userProfile) {
      if (userProfile.status === 'rejected') {
        setError('บัญชีของคุณถูกปฏิเสธการเข้าถึง');
      } else if (userProfile.status === 'pending') {
        navigate('/pending');
      } else if (userProfile.status === 'approved') {
        navigate('/dashboard');
      }
    }
  }, [userProfile, navigate]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginWithEmail(email, password);
      await refreshProfile();
    } catch (err: any) {
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
      } else {
        setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบ');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
      await refreshProfile();
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError('เกิดข้อผิดพลาดในการเข้าสู่ระบบด้วย Google');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50 font-sans">
      {/* Left Side - Info */}
      <div className="hidden lg:flex lg:w-1/2 bg-slate-900 text-white flex-col justify-center p-12 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-blue-900/20 z-0"></div>
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-600 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-cyan-600 rounded-full mix-blend-multiply filter blur-3xl opacity-50 animate-blob animation-delay-2000"></div>
        
        <div className="z-10 max-w-lg mx-auto">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mb-8 shadow-lg shadow-blue-500/30">
            <span className="text-2xl font-bold text-white">CMG</span>
          </div>
          <h1 className="text-5xl font-bold mb-6 leading-tight">
            ระบบจัดการ<br/>
            <span className="text-blue-400">ข้อมูลพนักงาน HR</span>
          </h1>
          <p className="text-slate-300 text-lg mb-12">
            Construction Management Group<br/>
            บริหารจัดการข้อมูลพนักงาน สถิติการมาทำงาน ขาด ลา มาสาย อย่างมีประสิทธิภาพ โปรงใส และตรวจสอบได้
          </p>
          
          <div className="space-y-6">
            <div className="flex items-start gap-4 bg-white/5 p-4 rounded-xl backdrop-blur-sm border border-white/10">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                <span className="text-blue-400 font-bold">1</span>
              </div>
              <div>
                <h3 className="font-semibold text-white mb-1">ข้อมูลพนักงานครบวงจร</h3>
                <p className="text-slate-400 text-sm">จัดการข้อมูลส่วนตัว ประวัติการทำงาน และรายละเอียดสัญญาจ้าง</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4 bg-white/5 p-4 rounded-xl backdrop-blur-sm border border-white/10">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center shrink-0">
                <span className="text-cyan-400 font-bold">2</span>
              </div>
              <div>
                <h3 className="font-semibold text-white mb-1">สถิติการทำงาน Real-time</h3>
                <p className="text-slate-400 text-sm">ติดตามบันทึกการเข้างาน ขาด ลา มาสาย ได้อย่างแม่นยำ</p>
              </div>
            </div>
            
            <div className="flex items-start gap-4 bg-white/5 p-4 rounded-xl backdrop-blur-sm border border-white/10">
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center shrink-0">
                <span className="text-orange-400 font-bold">3</span>
              </div>
              <div>
                <h3 className="font-semibold text-white mb-1">ระบบสิทธิ์หลายระดับ</h3>
                <p className="text-slate-400 text-sm">จัดการ Role-Based Access Control สำหรับทุกทีมและโครงการ</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="absolute bottom-8 left-12 z-10 text-slate-500 text-sm">
          © {new Date().getFullYear()} CMG · All rights reserved
        </div>
      </div>
      
      {/* Right Side - Login Form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-8 bg-white">
        <div className="w-full max-w-md">
          <div className="mb-10 text-center lg:text-left">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">ยินดีต้อนรับ 👋</h2>
            <p className="text-gray-500">กรุณาเข้าสู่ระบบเพื่อดำเนินการต่อ</p>
          </div>
          
          {error && (
            <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg flex items-start gap-3">
              <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          )}
          
          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-3 px-4 rounded-xl transition-all shadow-sm mb-6 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Continue with Google
          </button>
          
          <div className="relative flex items-center justify-center mb-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative bg-white px-4 text-sm text-gray-500">หรือเข้าด้วย Email</div>
          </div>
          
          <form onSubmit={handleEmailLogin} className="space-y-5">
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
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                  placeholder="you@example.com"
                  required
                />
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Password / รหัสผ่าน</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-sm"
                  placeholder="••••••••"
                  required
                />
              </div>
            </div>
            
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed flex justify-center items-center gap-2 mt-4"
            >
              {loading ? <Loader2 className="animate-spin" size={20} /> : 'เข้าสู่ระบบ'}
            </button>
          </form>
          
          <p className="mt-8 text-center text-sm text-gray-600">
            ยังไม่มีบัญชี? <Link to="/register" className="text-blue-600 hover:text-blue-800 font-semibold transition-colors">สมัครใช้งาน</Link>
          </p>
        </div>
      </div>
    </div>
  );
};
