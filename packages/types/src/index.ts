export type UserRole = "ADMIN" | "OPERATOR";

export type FieldType =
  | "CHECKBOX"
  | "TEXT"
  | "SELECT"
  | "PHOTO_UPLOAD"
  | "NUMBER_RANGE";

/** A form-specific status configured by an administrator. */
export type InspectionStatus = string;
export type QuestionSeverity = "NORMAL" | "MAJOR" | "CRITICAL";

export interface NumberRange {
  min: number;
  max: number;
}

export interface InspectionQuestionTranslation {
  label?: string;
  description?: string;
  options?: string[];
}

export interface InspectionQuestion {
  id: string;
  label: string;
  type: FieldType;
  isRequired: boolean;
  severity?: QuestionSeverity;
  /** @deprecated Kept for forms saved before severity levels were introduced. */
  isCritical?: boolean;
  instructionImageUrl?: string;
  okImageUrl?: string;
  nokImageUrl?: string;
  description?: string;
  options?: string[];
  expectedValue?: Exclude<InspectionAnswerValue, null>;
  range?: NumberRange;
  /** Optional display copy keyed by ISO language code; Polish fields above are the source. */
  translations?: Partial<Record<"en" | "uk", InspectionQuestionTranslation>>;
}

export interface InspectionForm {
  id: string;
  title: string;
  code: string;
  version: number;
  /** Consecutive NOK results required to raise a quality-series alert. */
  nokStreakThreshold: number;
  /** Whether an authenticated operator is required to complete this form. */
  requiresLogin: boolean;
  allowedStatuses: InspectionStatus[];
  questions: InspectionQuestion[];
  /** Processes in which this form can be used. */
  processIds: string[];
  /** Publication date of this immutable revision. */
  createdAt: string;
  /** Date when the form and all its revisions were archived. */
  archivedAt: string | null;
}

export interface InspectionProcess {
  id: string;
  name: string;
}

export interface Station {
  id: string;
  code: string;
  name: string;
  ipAddress: string | null;
  process: InspectionProcess | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MesTraceabilityPayload {
  vinOrSerialNumber: string;
  stationId: string;
  operatorId: string;
  formCode: string;
  status: string;
  summary: {
    totalQuestions: number;
    passedCount: number;
    failedCount: number;
  };
  completedAt: Date;
}

export type InspectionAnswerValue = string | number | boolean | null;

export interface InspectionAnswer {
  questionId: string;
  value: InspectionAnswerValue;
}

export interface ScadaSettings {
  enabled: boolean;
  baseUrl: string;
  routeCheckPath: string;
  submitResultPath: string;
  publicWebUrl: string;
  timeoutMs: number;
}

export interface ScadaRouteCheckRequest {
  serialNumber: string;
  processName: string;
}

export type ScadaRouteCheckResponse =
  | {
      allowed: true;
      serverUrl: string;
      product: { partNumber: string; productFamily: string };
    }
  | { allowed: false };

export type RouteCheckResult = ScadaRouteCheckResponse & {
  routeCheckId: string | null;
  integrationEnabled: boolean;
};

export interface ScadaInspectionResultRequest {
  serialNumber: string;
  processName: string;
  result: "PASS" | "FAIL";
  reportUrl: string;
}

export type PublicAnswerAssessment = "OK" | "NOK" | null;

export interface PublicReportAnswer {
  questionId: string;
  label: string;
  type: FieldType;
  value: InspectionAnswerValue;
  assessment: PublicAnswerAssessment;
  severity: QuestionSeverity;
  imageUrl: string | null;
  options?: string[];
  translations?: InspectionQuestion["translations"];
}

export interface PublicInspectionReport {
  publicReportId: string;
  serialNumber: string;
  result: string;
  completedAt: string;
  retest: {
    isRetest: boolean;
    originalReportId: string | null;
    originalCompletedAt: string | null;
  };
  station: { code: string; name: string | null };
  process: string | null;
  operatorName: string | null;
  form: { code: string; name: string; version: number };
  partNumber: string | null;
  productFamily: string | null;
  scadaUnitHistoryUrl: string | null;
  answers: PublicReportAnswer[];
  summary: { total: number; passed: number; failed: number };
  externalSyncStatus: "SYNCED" | "PENDING";
}
