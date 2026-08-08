export type UserRole = "ADMIN" | "OPERATOR";

export type FieldType =
  | "CHECKBOX"
  | "TEXT"
  | "SELECT"
  | "PHOTO_UPLOAD"
  | "NUMBER_RANGE";

/** A form-specific status configured by an administrator. */
export type InspectionStatus = string;

export interface NumberRange {
  min: number;
  max: number;
}

export interface InspectionQuestion {
  id: string;
  label: string;
  type: FieldType;
  isRequired: boolean;
  instructionImageUrl?: string;
  okImageUrl?: string;
  nokImageUrl?: string;
  description?: string;
  options?: string[];
  expectedValue?: Exclude<InspectionAnswerValue, null>;
  range?: NumberRange;
}

export interface InspectionForm {
  id: string;
  title: string;
  code: string;
  version: number;
  allowedStatuses: InspectionStatus[];
  questions: InspectionQuestion[];
  /** Processes in which this form can be used. */
  processIds: string[];
  /** Publication date of this immutable revision. */
  createdAt: string;
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
