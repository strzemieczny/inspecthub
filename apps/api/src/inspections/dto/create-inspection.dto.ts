import { Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class InspectionAnswerDto {
  @IsString()
  questionId!: string;

  @IsDefined()
  value!: string | number | boolean | null;
}

export class CreateInspectionDto {
  @IsOptional()
  @IsUUID()
  clientSubmissionId?: string;
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(86400)
  durationSeconds?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10000)
  answerCorrections?: number;

  @IsOptional()
  @IsString()
  routeCheckId?: string;

  @IsString()
  formId!: string;

  @IsString()
  vinOrSerialNumber!: string;

  @IsString()
  stationId!: string;

  @IsString()
  status!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InspectionAnswerDto)
  answers!: InspectionAnswerDto[];
}
