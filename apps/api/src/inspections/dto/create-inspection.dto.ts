import { Type } from 'class-transformer';
import {
  IsArray,
  IsDefined,
  IsOptional,
  IsString,
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
