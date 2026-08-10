import {
  IsBoolean,
  IsInt,
  IsIn,
  IsString,
  IsUrl,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class RouteCheckDto {
  @IsString()
  serialNumber!: string;

  @IsString()
  stationCode!: string;
}

export class DevScadaRouteCheckDto {
  @IsString()
  serialNumber!: string;

  @IsString()
  processName!: string;
}

export class DevScadaInspectionResultDto {
  @IsString()
  serialNumber!: string;

  @IsString()
  processName!: string;

  @IsIn(['PASS', 'FAIL'])
  result!: 'PASS' | 'FAIL';

  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  reportUrl!: string;
}

export class UpdateScadaSettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @ValidateIf(
    (value: UpdateScadaSettingsDto) => value.enabled || Boolean(value.baseUrl),
  )
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  baseUrl!: string;

  @IsString()
  routeCheckPath!: string;

  @IsString()
  submitResultPath!: string;

  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  publicWebUrl!: string;

  @IsInt()
  @Min(500)
  @Max(30000)
  timeoutMs!: number;
}
