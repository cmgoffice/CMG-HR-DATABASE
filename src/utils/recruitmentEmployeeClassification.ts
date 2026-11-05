const GROUP_TYPES: Record<string, string> = {
  staff: "Indirect",
  worker: "Direct_TeamLeader",
  "supply contract": "Direct_SupplyDC",
  subcontract: "Direct_SubContractor",
};

export function intakeEmployeeType(candidate: { สถานะกลุ่มงาน?: string; payType?: string }): string {
  const group = candidate.สถานะกลุ่มงาน?.trim().toLowerCase() || "";
  const payType = candidate.payType?.trim().toLowerCase() || "";
  if (group === "staff" && ["daily", "รายวัน"].includes(payType)) {
    return "Direct_TeamLeader";
  }
  return GROUP_TYPES[group] || "";
}

export function intakeWorkGroup(employeeType: string, sourceGroup?: string): string {
  if (employeeType === "Direct_TeamLeader") {
    const group = sourceGroup?.trim().toLowerCase();
    if (group === "staff") return "Staff";
    if (group === "worker") return "Worker";
    return "";
  }
  const groups: Record<string, string> = {
    Indirect: "Staff",
    Direct_SupplyDC: "Supply Contract",
    Direct_SubContractor: "Subcontract",
  };
  return groups[employeeType] || "";
}
