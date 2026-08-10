import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateStationDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @MinLength(1)
  processName!: string;
}

export class UpdateStationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  processName?: string;
}

export class IdentifyStationDto {
  @IsString()
  @MinLength(1)
  code!: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  processName?: string;
}
