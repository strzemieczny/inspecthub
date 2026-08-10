import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class PairCardDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  @Matches(/^[A-Za-z0-9]+$/)
  identifier!: string;

  @IsString()
  @Matches(/^\d{4}$/, { message: 'Kod z karty musi mieć dokładnie 4 cyfry' })
  cardCode!: string;
}
