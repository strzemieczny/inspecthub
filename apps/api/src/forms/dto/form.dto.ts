import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  Max,
  Min,
  IsOptional,
  IsString,
  isURL,
  Validate,
  ValidateNested,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
  type ValidationArguments,
} from 'class-validator';
import type { FieldType } from '@inspect-hub/types';

const FIELD_TYPES: FieldType[] = [
  'CHECKBOX',
  'TEXT',
  'SELECT',
  'PHOTO_UPLOAD',
  'NUMBER_RANGE',
];

@ValidatorConstraint({ name: 'isQuestionImageUrl' })
class IsQuestionImageUrl implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (typeof value !== 'string') return false;
    if (isURL(value, { require_tld: false })) return true;

    // Form images are stored as portable paths to the media endpoint.
    return /^\/(?:inspect-hub\/)?api\/media\/object\?[^\s#]+$/.test(value);
  }

  defaultMessage(args: ValidationArguments) {
    return `${args.property} must be a URL address`;
  }
}

@ValidatorConstraint({ name: 'expectedValueMatchesFieldType' })
class ExpectedValueMatchesFieldType implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments) {
    if (value === undefined) return true;
    const question = args.object as QuestionDto;

    if (question.type === 'CHECKBOX') return typeof value === 'boolean';
    if (question.type === 'NUMBER_RANGE')
      return typeof value === 'number' && Number.isFinite(value);
    return typeof value === 'string';
  }

  defaultMessage(args: ValidationArguments) {
    return `expectedValue ma nieprawidłowy typ dla pola ${(args.object as QuestionDto).type}`;
  }
}

@ValidatorConstraint({ name: 'validNumberRange' })
class ValidNumberRange implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments) {
    if (value === undefined) return true;
    const question = args.object as QuestionDto;
    if (
      question.type !== 'NUMBER_RANGE' ||
      typeof value !== 'object' ||
      value === null
    )
      return false;
    const range = value as { min?: unknown; max?: unknown };
    return (
      typeof range.min === 'number' &&
      Number.isFinite(range.min) &&
      typeof range.max === 'number' &&
      Number.isFinite(range.max) &&
      range.min <= range.max
    );
  }

  defaultMessage() {
    return 'range jest dozwolony tylko dla pola liczbowego i musi zawierać min nie większe niż max';
  }
}

class QuestionTranslationDto {
  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];
}

class QuestionTranslationsDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => QuestionTranslationDto)
  en?: QuestionTranslationDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => QuestionTranslationDto)
  uk?: QuestionTranslationDto;
}

export class QuestionDto {
  @IsString()
  id!: string;

  @IsString()
  label!: string;

  @IsIn(FIELD_TYPES)
  type!: FieldType;

  @IsBoolean()
  isRequired!: boolean;

  @IsOptional()
  @IsBoolean()
  isCritical?: boolean;

  @IsOptional()
  @IsIn(['NORMAL', 'MAJOR', 'CRITICAL'])
  severity?: 'NORMAL' | 'MAJOR' | 'CRITICAL';

  @IsOptional()
  @Validate(IsQuestionImageUrl)
  instructionImageUrl?: string;

  @IsOptional()
  @Validate(IsQuestionImageUrl)
  okImageUrl?: string;

  @IsOptional()
  @Validate(IsQuestionImageUrl)
  nokImageUrl?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  options?: string[];

  @IsOptional()
  @Validate(ExpectedValueMatchesFieldType)
  expectedValue?: string | number | boolean;

  @IsOptional()
  @Validate(ValidNumberRange)
  range?: { min: number; max: number };

  @IsOptional()
  @ValidateNested()
  @Type(() => QuestionTranslationsDto)
  translations?: QuestionTranslationsDto;
}

export class CreateFormDto {
  @IsString()
  title!: string;

  @IsString()
  code!: string;

  @IsInt()
  @Min(2)
  @Max(100)
  nokStreakThreshold!: number;

  @IsBoolean()
  requiresLogin!: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  allowedStatuses!: string[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions!: QuestionDto[];

  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  processIds!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  partNumbers?: string[];
}

export class UpdateFormDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(100)
  nokStreakThreshold?: number;

  @IsOptional()
  @IsBoolean()
  requiresLogin?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  allowedStatuses?: string[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions?: QuestionDto[];

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  processIds?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  partNumbers?: string[];
}

export class DuplicateFormDto {
  @IsString()
  title!: string;

  @IsString()
  code!: string;
}
