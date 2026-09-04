import { useEffect, useMemo, useState, useCallback } from "react";
import { getFirestore, doc, onSnapshot, setDoc } from "firebase/firestore";
import { useAuth } from "../auth/AuthContext";
import {
  DEFAULT_OT_LIMITS,
  OT_LIMITS_DOC_PATH,
  OT_LIMITS_EDITOR_ROLES,
  OvertimeLimitConfig,
} from "../config/overtimeLimits";

/**
 * Hook กลางสำหรับอ่าน/เขียนค่าเพดาน OT (settings/overtime_limits)
 * ใช้ร่วมกันระหว่าง OvertimePage และ ManpowerDashboard เพื่อไม่ให้ logic กระจัดกระจาย
 */
export const useOvertimeLimits = () => {
  const { firebaseUser, hasRole } = useAuth();
  const db = useMemo(() => getFirestore(), []);

  const [limits, setLimits] = useState<OvertimeLimitConfig>(DEFAULT_OT_LIMITS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const canEditLimits = useMemo(() => hasRole(OT_LIMITS_EDITOR_ROLES), [hasRole]);

  useEffect(() => {
    const ref = doc(db, ...OT_LIMITS_DOC_PATH);
    const unsubscribe = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as Partial<OvertimeLimitConfig>;
          setLimits({
            weeklyCapHours:
              typeof data.weeklyCapHours === "number" ? data.weeklyCapHours : DEFAULT_OT_LIMITS.weeklyCapHours,
            monthlyTiers:
              Array.isArray(data.monthlyTiers) && data.monthlyTiers.length > 0
                ? data.monthlyTiers
                : DEFAULT_OT_LIMITS.monthlyTiers,
            updatedAt: data.updatedAt,
            updatedBy: data.updatedBy,
          });
        } else {
          setLimits(DEFAULT_OT_LIMITS);
        }
        setLoading(false);
      },
      (error) => {
        console.error("Error listening to overtime_limits:", error);
        setLimits(DEFAULT_OT_LIMITS);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [db]);

  const updateLimits = useCallback(
    async (next: OvertimeLimitConfig) => {
      if (!canEditLimits) return;
      setSaving(true);
      try {
        const ref = doc(db, ...OT_LIMITS_DOC_PATH);
        await setDoc(
          ref,
          {
            weeklyCapHours: next.weeklyCapHours,
            monthlyTiers: next.monthlyTiers,
            updatedAt: Date.now(),
            updatedBy: firebaseUser?.email || "unknown",
          },
          { merge: false }
        );
      } finally {
        setSaving(false);
      }
    },
    [db, firebaseUser, canEditLimits]
  );

  return { limits, loading, saving, canEditLimits, updateLimits };
};
