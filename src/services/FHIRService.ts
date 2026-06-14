/**
 * @file src/services/FHIRService.ts
 * @description SMART on FHIR client service to query patients and sync clinical records.
 *
 * Connects to the public R4 FHIR sandbox: https://r4.smarthealthit.org
 */

import type { MedicalRecord, MedicationItem, VitalLogEntry, UserProfile } from '../types';

export interface FHIRPatient {
  id: string;
  name: string;
  dob: string;
  gender: string;
}

export const FHIRService = {
  /**
   * Fetches a list of patient profiles from the public SMART on FHIR R4 server.
   */
  fetchPatients: async (): Promise<FHIRPatient[]> => {
    try {
      const response = await fetch('https://r4.smarthealthit.org/Patient?_count=12');
      if (!response.ok) {
        throw new Error(`FHIR Server returned status: ${response.status}`);
      }
      const data = await response.json();
      const patients: FHIRPatient[] = [];

      if (data.entry && Array.isArray(data.entry)) {
        for (const entry of data.entry) {
          const res = entry.resource;
          if (res && res.id) {
            const nameObj = res.name?.[0];
            const given = nameObj?.given ? nameObj.given.join(' ') : '';
            const family = nameObj?.family || '';
            let fullName = `${given} ${family}`.trim() || 'Anonymous Patient';
            fullName = fullName.replace(/\d+/g, '').replace(/\s+/g, ' ').trim() || 'Anonymous Patient';
            
            patients.push({
              id: res.id,
              name: fullName,
              dob: res.birthDate || '1990-01-01',
              gender: res.gender || 'unknown',
            });
          }
        }
      }
      return patients;
    } catch (error) {
      console.warn('[FHIRService] Error fetching patients:', error);
      throw error;
    }
  },

  /**
   * Fetches and normalizes Observations, Immunizations, Conditions, and MedicationRequests
   * for a given patient ID from the public FHIR server.
   */
  fetchPatientData: async (patientId: string): Promise<{
    records: Omit<MedicalRecord, 'id'>[];
    medications: Omit<MedicationItem, 'id' | 'status'>[];
    vitals: Omit<VitalLogEntry, 'id' | 'timestamp'>[];
    completedVaccines: string[];
  }> => {
    const records: Omit<MedicalRecord, 'id'>[] = [];
    const medications: Omit<MedicationItem, 'id' | 'status'>[] = [];
    const vitals: Omit<VitalLogEntry, 'id' | 'timestamp'>[] = [];
    const completedVaccines: string[] = [];

    // Helper to format date safely
    const formatDate = (dateStr?: string): string => {
      if (!dateStr) return new Date().toLocaleDateString();
      try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return new Date().toLocaleDateString();
        return d.toISOString().split('T')[0];
      } catch {
        return new Date().toLocaleDateString();
      }
    };

    // Helper to fetch endpoint resources
    const fetchFHIRResource = async (resourceName: string): Promise<any[]> => {
      try {
        const url = `https://r4.smarthealthit.org/${resourceName}?patient=${patientId}&_count=50`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const json = await res.json();
        return json.entry && Array.isArray(json.entry) ? json.entry.map((e: any) => e.resource) : [];
      } catch (err) {
        console.warn(`[FHIRService] Failed to fetch ${resourceName}:`, err);
        return [];
      }
    };

    // Query all resources concurrently
    const [observations, immunizations, conditions, medicationRequests] = await Promise.all([
      fetchFHIRResource('Observation'),
      fetchFHIRResource('Immunization'),
      fetchFHIRResource('Condition'),
      fetchFHIRResource('MedicationRequest'),
    ]);

    // 1. Process Observations (Labs and Vitals)
    for (const obs of observations) {
      const codeText = obs.code?.text || obs.code?.coding?.[0]?.display || 'Observation Panel';
      const dateStr = formatDate(obs.effectiveDateTime || obs.issued);
      const category = obs.category?.[0]?.coding?.[0]?.code || 'laboratory';
      
      const valueString = obs.valueQuantity 
        ? `${obs.valueQuantity.value.toFixed(1)} ${obs.valueQuantity.unit || ''}`
        : (obs.valueCodeableConcept?.text || 'Recorded');

      records.push({
        type: 'LabResult',
        title: codeText,
        value: valueString,
        date: dateStr,
        provider: 'Quest Diagnostics Services',
        status: obs.status || 'final',
        fhirData: JSON.stringify(obs, null, 2),
      });

      // Parse specific clinical vitals logs
      const lowerCodeText = codeText.toLowerCase();
      const codeCodes = obs.code?.coding?.map((c: any) => String(c.code)) || [];

      // Blood Pressure check (LOINC 85354-9 or systolic/diastolic components)
      if (codeCodes.includes('85354-9') || lowerCodeText.includes('blood pressure') || obs.component) {
        let systolicBP: number | undefined;
        let diastolicBP: number | undefined;

        if (obs.component && Array.isArray(obs.component)) {
          for (const comp of obs.component) {
            const compCode = comp.code?.coding?.[0]?.code;
            const compDisplay = (comp.code?.text || comp.code?.coding?.[0]?.display || '').toLowerCase();
            const compVal = comp.valueQuantity?.value;

            if (compCode === '8480-6' || compDisplay.includes('systolic')) {
              systolicBP = compVal;
            } else if (compCode === '8462-4' || compDisplay.includes('diastolic')) {
              diastolicBP = compVal;
            }
          }
        }

        if (systolicBP !== undefined || diastolicBP !== undefined) {
          vitals.push({
            systolicBP: systolicBP ? Math.round(systolicBP) : undefined,
            diastolicBP: diastolicBP ? Math.round(diastolicBP) : undefined,
          });
        }
      }

      // Blood Glucose check (glucose LOINCs: 15074-8, 2339-0, etc.)
      if (codeCodes.includes('15074-8') || codeCodes.includes('2339-0') || lowerCodeText.includes('glucose')) {
        const val = obs.valueQuantity?.value;
        if (typeof val === 'number') {
          vitals.push({
            bloodGlucose: Math.round(val),
            glucoseContext: 'General',
          });
        }
      }

      // Oxygen Saturation SpO2 check (LOINC 2708-6, 59408-5)
      if (codeCodes.includes('2708-6') || codeCodes.includes('59408-5') || lowerCodeText.includes('oxygen') || lowerCodeText.includes('spo2')) {
        const val = obs.valueQuantity?.value;
        if (typeof val === 'number') {
          vitals.push({
            spo2: Math.round(val),
          });
        }
      }

      // Body Temperature check (LOINC 8310-5)
      if (codeCodes.includes('8310-5') || lowerCodeText.includes('temperature') || lowerCodeText.includes('temp')) {
        let val = obs.valueQuantity?.value;
        if (typeof val === 'number') {
          // If in Celsius (value typically < 45), convert to Fahrenheit
          if (val < 45) {
            val = (val * 9) / 5 + 32;
          }
          vitals.push({
            temperature: Math.round(val * 10) / 10,
          });
        }
      }
    }

    // 2. Process Immunizations
    for (const imm of immunizations) {
      const vaccineName = imm.vaccineCode?.text || imm.vaccineCode?.coding?.[0]?.display || 'Immunization';
      const dateStr = formatDate(imm.occurrenceDateTime);
      const provider = imm.performer?.[0]?.actor?.display || 'CVS Pharmacy Immunizations';

      records.push({
        type: 'Immunization',
        title: vaccineName,
        value: 'Completed',
        date: dateStr,
        provider,
        status: imm.status || 'completed',
        fhirData: JSON.stringify(imm, null, 2),
      });

      completedVaccines.push(vaccineName);
    }

    // 3. Process Conditions
    for (const cond of conditions) {
      const diagnosisName = cond.code?.text || cond.code?.coding?.[0]?.display || 'Diagnosis';
      const dateStr = formatDate(cond.recordedDate || cond.onsetDateTime);
      const status = cond.clinicalStatus?.coding?.[0]?.code || 'active';

      records.push({
        type: 'Condition',
        title: diagnosisName,
        value: `Status: ${status}`,
        date: dateStr,
        provider: 'Clinical Care Specialist',
        status: cond.verificationStatus?.coding?.[0]?.code || 'Confirmed',
        fhirData: JSON.stringify(cond, null, 2),
      });
    }

    // 4. Process MedicationRequests
    for (const medReq of medicationRequests) {
      const drugName = medReq.medicationCodeableConcept?.text || medReq.medicationCodeableConcept?.coding?.[0]?.display || 'Prescribed Drug';
      const dosageText = medReq.dosageInstruction?.[0]?.text || medReq.dosageInstruction?.[0]?.patientInstruction || 'Take as directed by physician';
      const dateStr = formatDate(medReq.authoredOn);
      const prescriber = medReq.requester?.display || 'Medical Provider';

      records.push({
        type: 'Prescription',
        title: drugName,
        value: dosageText,
        date: dateStr,
        provider: prescriber,
        status: medReq.status || 'active',
        fhirData: JSON.stringify(medReq, null, 2),
      });

      // Filter out completed/inactive requests if status exists and is canceled or completed
      const reqStatus = (medReq.status || '').toLowerCase();
      if (reqStatus !== 'cancelled' && reqStatus !== 'completed' && reqStatus !== 'stopped') {
        // Map to medication schedule item
        medications.push({
          name: drugName,
          dosage: dosageText,
          time: '09:00', // Default scheduling
          icon: 'pill',
          stock: 30,
          refillThreshold: 5,
          refillAlertsEnabled: true,
          inactiveIngredients: [],
        });
      }
    }

    return {
      records,
      medications,
      vitals,
      completedVaccines,
    };
  },
};
