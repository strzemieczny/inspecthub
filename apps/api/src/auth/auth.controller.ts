import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { CardLoginDto } from './dto/card-login.dto';
import { PairCardDto } from './dto/pair-card.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('card-login')
  cardLogin(@Body() dto: CardLoginDto) {
    return this.auth.cardLogin(dto);
  }

  @Post('pair-card')
  pairCard(@Body() dto: PairCardDto) {
    return this.auth.pairCard(dto);
  }
}
