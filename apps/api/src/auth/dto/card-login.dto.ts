import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CardLoginDto {
  @IsString()
  @MinLength(1)
  @MaxLength(30)
  @Matches(/^[A-Za-z0-9]+$/, {
    message: 'Identyfikator może zawierać tylko litery i cyfry',
  })
  identifier!: string;
}
