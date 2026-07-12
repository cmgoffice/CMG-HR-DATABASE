import React, { useState } from 'react';
import { getFirestore, collection, getDocs, doc, updateDoc, deleteField } from 'firebase/firestore';
import { Trash2, AlertCircle, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { InfoTooltip } from './InfoTooltip';

export const DeleteProjectStatus = () => {
  const { hasRole } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [result, setResult] = useState<{
    success: number;
    errors: number;
    total: number;
    errorDetails: Array<{employeeId: string; error: string}>;
  } | null>(null);
  
  const db = getFirestore();

  const handleDelete = async () => {
    setIsLoading(true);
    setResult(null);
    
    try {
      // Get reference to employee_data collection
      const employeeDataRef = collection(db, "CMG-HR-Database", "root", "employee_data");
      
      // Get all employee documents
      const querySnapshot = await getDocs(employeeDataRef);
      
      if (querySnapshot.empty) {
        setResult({
          success: 0,
          errors: 0,
          total: 0,
          errorDetails: []
        });
        setShowConfirmDialog(false);
        setIsLoading(false);
        return;
      }
      
      let successCount = 0;
      let errorCount = 0;
      const errors: Array<{employeeId: string; error: string}> = [];
      
      // Process each employee document
      for (const docSnapshot of querySnapshot.docs) {
        const employeeId = docSnapshot.id;
        const employeeData = docSnapshot.data();
        
        try {
          // Check if the employee has "สถานะโครงการ" field
          if ('สถานะโครงการ' in employeeData) {
            // Delete the field using deleteField()
            const employeeRef = doc(db, "CMG-HR-Database", "root", "employee_data", employeeId);
            await updateDoc(employeeRef, {
              'สถานะโครงการ': deleteField()
            });
            
            successCount++;
          }
        } catch (error: any) {
          errors.push({ 
            employeeId, 
            error: error.message || 'Unknown error' 
          });
          errorCount++;
        }
      }
      
      setResult({
        success: successCount,
        errors: errorCount,
        total: querySnapshot.size,
        errorDetails: errors
      });
      
    } catch (error) {
      console.error('Error in delete operation:', error);
      setResult({
        success: 0,
        errors: 1,
        total: 0,
        errorDetails: [{
          employeeId: 'SYSTEM',
          error: error instanceof Error ? error.message : 'Unknown error'
        }]
      });
    } finally {
      setIsLoading(false);
      setShowConfirmDialog(false);
    }
  };

  // Check if user has permission
  if (!hasRole(['MasterAdmin', 'MD', 'HRM'])) {
    return (
      <div className="p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 flex items-center gap-4">
          <XCircle className="w-8 h-8 text-red-500 flex-shrink-0" />
          <div>
            <h3 className="text-lg font-semibold text-red-800">ไม่มีสิทธิ์เข้าถึง</h3>
            <p className="text-red-600 mt-1">คุณไม่มีสิทธิ์ใช้งานฟังก์ชันนี้ กรุณาติดต่อผู้ดูแลระบบ</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <span>ลบข้อมูลสถานะโครงการ</span>
          <InfoTooltip content="คำสั่งนี้จะลบ field สถานะโครงการออกจาก employee_data ทุกคน จึงเหมาะกับงานแก้ไขข้อมูลครั้งใหญ่และควรใช้อย่างระมัดระวัง" />
        </h1>
        
        {/* Warning Banner */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-6 mb-6">
          <div className="flex items-start gap-4">
            <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-1" />
            <div className="flex-1">
              <h3 className="font-semibold text-amber-900">คำเตือน</h3>
              <p className="text-amber-700 mt-2">
                การดำเนินการนี้จะลบข้อมูล "สถานะโครงการ" ของพนักงานทั้งหมดในระบบ
                และไม่สามารถกู้คืนได้ กรุณาตรวจสอบให้แน่ใจก่อนดำเนินการ
              </p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        {!result && (
          <div className="bg-white rounded-lg border p-6">
            <button
              onClick={() => setShowConfirmDialog(true)}
              className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white font-medium py-3 px-6 rounded-lg transition-colors flex items-center justify-center gap-2"
              disabled={isLoading}
            >
              <Trash2 className="w-5 h-5" />
              ลบข้อมูลสถานะโครงการทั้งหมด
            </button>
          </div>
        )}

        {/* Confirmation Dialog */}
        {showConfirmDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-md w-full p-6">
              <h3 className="text-lg font-semibold mb-4">ยืนยันการลบข้อมูล</h3>
              <p className="text-gray-600 mb-6">
                คุณแน่ใจหรือไม่ที่จะลบข้อมูล "สถานะโครงการ" ของพนักงานทั้งหมด?
                การดำเนินการนี้ไม่สามารถย้อนกลับได้
              </p>
              <div className="flex gap-4 justify-end">
                <button
                  onClick={() => setShowConfirmDialog(false)}
                  className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                  disabled={isLoading}
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2"
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      กำลังดำเนินการ...
                    </>
                  ) : (
                    'ยืนยันการลบ'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="mt-6 space-y-4">
            {/* Summary */}
            <div className="bg-white rounded-lg border p-6">
              <h3 className="font-semibold text-lg mb-4">สรุปผลการดำเนินการ</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-medium text-green-800">สำเร็จ</span>
                  </div>
                  <p className="text-2xl font-bold text-green-600">{result.success}</p>
                </div>
                
                <div className="bg-red-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <XCircle className="w-5 h-5 text-red-600" />
                    <span className="text-sm font-medium text-red-800">ผิดพลาด</span>
                  </div>
                  <p className="text-2xl font-bold text-red-600">{result.errors}</p>
                </div>
                
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-gray-700">ทั้งหมด</span>
                  </div>
                  <p className="text-2xl font-bold text-gray-700">{result.total}</p>
                </div>
              </div>
            </div>

            {/* Error Details */}
            {result.errorDetails.length > 0 && (
              <div className="bg-white rounded-lg border p-6">
                <h3 className="font-semibold text-lg mb-4 text-red-600">รายละเอียดข้อผิดพลาด</h3>
                <div className="space-y-2">
                  {result.errorDetails.map((error, index) => (
                    <div key={index} className="bg-red-50 rounded p-3 text-sm">
                      <span className="font-medium">รหัสพนักงาน {error.employeeId}:</span>
                      <span className="text-red-600 ml-2">{error.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Reset Button */}
            <button
              onClick={() => setResult(null)}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium py-2 px-4 rounded-lg transition-colors"
            >
              กลับ
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
