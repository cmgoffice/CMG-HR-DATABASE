import React, { useState, useEffect } from 'react';
import { X, ArrowRight, AlertCircle, CheckCircle, Search } from 'lucide-react';

interface SchemaField {
  id: string;
  label: string;
  type: string;
  required?: boolean;
}

interface ColumnMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (mapping: Record<string, string>) => void;
  csvHeaders: string[];
  schemaFields: SchemaField[];
}

export const ColumnMappingModal: React.FC<ColumnMappingModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  csvHeaders,
  schemaFields,
}) => {
  const [employeeIdColumn, setEmployeeIdColumn] = useState<string>('');
  const [autoMapping, setAutoMapping] = useState<Record<string, string>>({});
  const [error, setError] = useState<string>('');

  // Auto-map columns based on exact or similar names
  useEffect(() => {
    if (isOpen && csvHeaders.length > 0) {
      const mapping: Record<string, string> = {};
      
      // Find รหัสพนักงาน column
      const employeeIdHeader = csvHeaders.find(
        (header) => 
          header.trim().toLowerCase() === 'รหัสพนักงาน' ||
          header.trim().toLowerCase() === 'employee id' ||
          header.trim().toLowerCase() === 'employeeid' ||
          header.trim().toLowerCase().includes('รหัส')
      );
      
      if (employeeIdHeader) {
        setEmployeeIdColumn(employeeIdHeader);
        mapping['รหัสพนักงาน'] = employeeIdHeader;
      }
      
      // Auto-map other columns
      schemaFields.forEach((field) => {
        if (field.id === 'รหัสพนักงาน') return; // Skip, already handled
        
        // Try exact match first
        const exactMatch = csvHeaders.find(
          (header) => header.trim().toLowerCase() === field.label.toLowerCase() ||
                      header.trim().toLowerCase() === field.id.toLowerCase()
        );
        
        if (exactMatch) {
          mapping[field.id] = exactMatch;
        }
      });
      
      setAutoMapping(mapping);
    }
  }, [isOpen, csvHeaders, schemaFields]);

  const handleConfirm = () => {
    if (!employeeIdColumn) {
      setError('กรุณาเลือกคอลัมน์ "รหัสพนักงาน"');
      return;
    }
    
    // Create final mapping with employee ID + auto-mapped columns
    const finalMapping = {
      ...autoMapping,
      'รหัสพนักงาน': employeeIdColumn,
    };
    
    onConfirm(finalMapping);
  };

  if (!isOpen) return null;

  const otherMappedCount = Object.keys(autoMapping).filter(k => k !== 'รหัสพนักงาน').length;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col">
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-xl font-bold text-gray-800 flex items-center gap-2">
                <Search className="text-blue-600" size={24} />
                เลือกคอลัมน์รหัสพนักงาน
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                เลือกคอลัมน์ที่เป็น "รหัสพนักงาน" ใน CSV ของคุณ
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-red-500 hover:bg-red-50 p-2 rounded-full transition-colors"
            >
              <X size={24} />
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="p-6 space-y-6">
          {/* Employee ID Selection */}
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
            <label className="block text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
              <span className="px-2 py-1 bg-red-500 text-white text-xs rounded">จำเป็น</span>
              คอลัมน์รหัสพนักงาน
            </label>
            <select
              value={employeeIdColumn}
              onChange={(e) => {
                setEmployeeIdColumn(e.target.value);
                setError('');
              }}
              className="w-full px-4 py-3 border-2 border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base font-medium bg-white"
            >
              <option value="">-- เลือกคอลัมน์รหัสพนักงาน --</option>
              {csvHeaders.map((header) => (
                <option key={header} value={header}>
                  {header}
                </option>
              ))}
            </select>
            {error && (
              <div className="mt-3 flex items-center gap-2 text-red-700 text-sm">
                <AlertCircle size={16} />
                {error}
              </div>
            )}
          </div>

          {/* Auto-mapped columns info */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="text-green-600 shrink-0 mt-0.5" size={20} />
              <div className="flex-1">
                <p className="font-semibold text-green-800 mb-1">
                  คอลัมน์อื่นๆ จะถูกจับคู่อัตโนมัติ
                </p>
                <p className="text-sm text-green-700">
                  ระบบจะจับคู่คอลัมน์ที่ชื่อตรงกันโดยอัตโนมัติ ({otherMappedCount} คอลัมน์)
                </p>
                {otherMappedCount > 0 && (
                  <div className="mt-2 text-xs text-green-600">
                    ตัวอย่าง: {Object.entries(autoMapping)
                      .filter(([k]) => k !== 'รหัสพนักงาน')
                      .slice(0, 5)
                      .map(([k, v]) => `${k} ← ${v}`)
                      .join(', ')}
                    {otherMappedCount > 5 && ` และอีก ${otherMappedCount - 5} คอลัมน์`}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">ตัวอย่างคอลัมน์ใน CSV</h4>
            <div className="flex flex-wrap gap-2">
              {csvHeaders.map((header) => (
                <span
                  key={header}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium ${
                    header === employeeIdColumn
                      ? 'bg-blue-600 text-white border-2 border-blue-700'
                      : autoMapping[header] || Object.values(autoMapping).includes(header)
                      ? 'bg-green-100 text-green-700 border border-green-300'
                      : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {header}
                  {header === employeeIdColumn && ' 🔑'}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 flex justify-between items-center">
          <button
            onClick={onClose}
            className="px-6 py-2.5 text-gray-600 hover:bg-gray-200 rounded-lg font-medium transition-colors"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleConfirm}
            disabled={!employeeIdColumn}
            className={`px-8 py-2.5 rounded-lg font-semibold transition-all ${
              !employeeIdColumn
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700 shadow-md hover:shadow-lg'
            }`}
          >
            {employeeIdColumn ? '✓ ยืนยันและ Import' : 'เลือกรหัสพนักงานก่อน'}
          </button>
        </div>
      </div>
    </div>
  );
};
