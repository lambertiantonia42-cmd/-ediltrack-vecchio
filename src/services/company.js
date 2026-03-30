// src/services/company.js
export const AZIENDA_ID = "ditta_vecchio";

/**
 * Crea un payload "audit" standard per creare/modificare record.
 * user: Firebase Auth currentUser
 */
export function auditCreate(user) {
  return {
    aziendaId: AZIENDA_ID,
    createdBy: user?.uid || null,
    createdByEmail: user?.email || null,
  };
}

export function auditUpdate(user) {
  return {
    updatedBy: user?.uid || null,
    updatedByEmail: user?.email || null,
  };
}