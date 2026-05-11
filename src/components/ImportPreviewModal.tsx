import React, { useState } from 'react';
import { X, CheckSquare, Square, ArrowRight, AlertCircle } from 'lucide-react';

interface ImportPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selectedIndices: number[]) => void;
  rows: Record<string, string>[];
  schemaFields: { id: string; label: string }[];
}

export const ImportPreviewModal: React.FC<ImportPreviewModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  rows,
  schemaFields,
}) => {
  const [selected, setSelected] = useState<Set<number>>(new Set(rows.map((_, i) => i)));
  const [selectAll, setSelectAll] = useState(true);

  if (!isOpen) return null;

  const toggleAll = () => {
    if (selectAll) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((_, i) => i)));
    }
    setSelectAll(!selectAll);
  };

  const toggleRow = (idx: number) => {
    const newSet = new Set(selected);
    if (newSet.has(idx)) {
      newSet.delete(idx);
    } else {
      newSet.add(idx);
    }
    setSelected(newSet);
    setSelectAll(newSet.size === rows.length);
  };

  const displayFields = schemaFields.filter(f => 
    rows.some(r => r[f.id] && r[f.id].trim() !== '')
  ).slice(0, 6);

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[80] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="p-5 border-b flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
              <CheckSquare className="text-blue-600" size={22} />
              เลือกรายการที่จะนำเข้า
            </h3>
            <p className="text-sm text-gray-600 mt-1">
              พบ {rows.length} รายการ | เลือก {selected.size} รายการ
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 p-2 rounded-full">
            <X size={20} />
          </button>
        </div>

        <div className="p-4 border-b bg-gray-50 flex items-center gap-3">
          <button
            onClick={toggleAll}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border rounded-lg text-sm hover:bg-gray-50"
          >
            {selectAll ? <CheckSquare size={16} /> : <Square size={16} />}
            {selectAll ? 'ยกเลิกเลือกทั้งหมด' : 'เลือกทั้งหมด'}
          </button>
        </div>

        <div className="flex-1 overflow-auto p-0">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-100 sticky top-0 z-10">
              <tr>
                <th className="w-10 p-2 border-b text-center">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={toggleAll}
                    className="w-4 h-4"
                  />
                </th>
                <th className="w-10 p-2 border-b text-center text-gray-500">#</th>
                {displayFields.map(f => (
                  <th key={f.id} className="p-2 border-b text-left font-semibold text-gray-700">{f.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, idx) => (
                <tr key={idx} className={`${selected.has(idx) ? 'bg-white' : 'bg-gray-50 opacity-60'}`}>
                  <td className="p-2 text-center">
                    <input
                      type="checkbox"
                      checked={selected.has(idx)}
                      onChange={() => toggleRow(idx)}
                      className="w-4 h-4"
                    />
                  </td>
                  <td className="p-2 text-center text-gray-500">{idx + 1}</td>
                  {displayFields.map(f => (
                    <td key={f.id} className="p-2 border-b text-gray-800">
                      {row[f.id] || '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="p-5 border-t bg-gray-50 flex justify-between items-center">
          <button onClick={onClose} className="px-5 py-2 text-gray-600 hover:bg-gray-200 rounded-lg">
            ยกเลิก
          </button>
          <button
            onClick={() => onConfirm(Array.from(selected))}
            disabled={selected.size === 0}
            className={`px-6 py-2 rounded-lg font-semibold flex items-center gap-2 ${
              selected.size === 0
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            <ArrowRight size={16} />
            นำเข้า {selected.size} รายการ
          </button>
        </div>
      </div>
    </div>
  );
};
