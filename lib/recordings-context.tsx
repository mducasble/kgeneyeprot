import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Recording, UploadStatus, SessionData } from "@/lib/types";
import type { LocalQCReport } from "@/lib/qc-types";

interface RecordingsContextValue {
  recordings: Recording[];
  addRecording: (recording: Recording) => void;
  removeRecording: (id: string) => void;
  updateUploadStatus: (id: string, status: UploadStatus, submissionId?: string) => void;
  setQCReport: (id: string, report: LocalQCReport) => void;
  setSessionData: (id: string, data: SessionData) => void;
  pendingUploads: Recording[];
  isLoading: boolean;
}

const RecordingsContext = createContext<RecordingsContextValue | null>(null);
const STORAGE_KEY = "kgen_recordings";

export function RecordingsProvider({ children }: { children: ReactNode }) {
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY);
        if (stored) {
          setRecordings(JSON.parse(stored));
        }
      } catch {}
      setIsLoading(false);
    })();
  }, []);

  const persist = useCallback(async (recs: Recording[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(recs));
    } catch {}
  }, []);

  const addRecording = useCallback((recording: Recording) => {
    setRecordings((prev) => {
      const next = [recording, ...prev];
      persist(next);
      return next;
    });
  }, [persist]);

  const removeRecording = useCallback((id: string) => {
    setRecordings((prev) => {
      const next = prev.filter((r) => r.id !== id);
      persist(next);
      return next;
    });
  }, [persist]);

  const updateUploadStatus = useCallback(
    (id: string, status: UploadStatus, submissionId?: string) => {
      setRecordings((prev) => {
        const next = prev.map((r) =>
          r.id === id ? { ...r, uploadStatus: status, ...(submissionId ? { submissionId } : {}) } : r,
        );
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setQCReport = useCallback(
    (id: string, report: LocalQCReport) => {
      setRecordings((prev) => {
        const next = prev.map((r) => (r.id === id ? { ...r, qcReport: report } : r));
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const setSessionData = useCallback(
    (id: string, data: SessionData) => {
      setRecordings((prev) => {
        const next = prev.map((r) =>
          r.id === id ? { ...r, ...data } : r,
        );
        persist(next);
        return next;
      });
      console.log(`[SESSION] Data saved for recording ${id}:`, data.sessionId);
    },
    [persist],
  );

  const pendingUploads = useMemo(
    () =>
      recordings.filter(
        (r) =>
          r.uploadStatus === "queued" ||
          r.uploadStatus === "failed" ||
          r.uploadStatus === "retrying",
      ),
    [recordings],
  );

  const value = useMemo(
    () => ({
      recordings,
      addRecording,
      removeRecording,
      updateUploadStatus,
      setQCReport,
      setSessionData,
      pendingUploads,
      isLoading,
    }),
    [recordings, addRecording, removeRecording, updateUploadStatus, setQCReport, setSessionData, pendingUploads, isLoading],
  );

  return <RecordingsContext.Provider value={value}>{children}</RecordingsContext.Provider>;
}

export function useRecordings() {
  const context = useContext(RecordingsContext);
  if (!context) throw new Error("useRecordings must be used within RecordingsProvider");
  return context;
}
