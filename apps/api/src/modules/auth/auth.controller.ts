import { Body, Controller, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AppConfigService } from '../../config/app-config.service';
import { toUserResponse } from '../users/mappers/to-user-response';
import { AuthService, AuthSession } from './auth.service';
import { Public } from './decorators/public.decorator';
import { AuthResponse } from './dto/auth.response.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { clearRefreshCookie, REFRESH_COOKIE, setRefreshCookie } from './refresh-cookie';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

function readRefreshCookie(request: Request): string | undefined {
  const cookies = request.cookies as Record<string, unknown> | undefined;
  const value = cookies?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

@ApiTags('auth')
@Public()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfigService,
  ) {}

  @Post('register')
  @Throttle({ default: { limit: 10, ttl: HOUR_MS } })
  @ApiOperation({ summary: 'Create a customer account and start a session' })
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    return this.respond(response, await this.auth.register(dto));
  }

  // Per IP: 20/min here, plus 5/min per IP+email (the `login-identity` limiter).
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 20, ttl: MINUTE_MS } })
  @ApiOperation({ summary: 'Log in with email and password' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    return this.respond(response, await this.auth.login(dto));
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: MINUTE_MS } })
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Rotate the refresh cookie and issue a new access token' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    try {
      return this.respond(response, await this.auth.refresh(readRefreshCookie(request)));
    } catch (error) {
      // A rejected cookie is useless; drop it so the browser stops sending it.
      clearRefreshCookie(response, this.config);
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Revoke the current session and clear the refresh cookie' })
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(readRefreshCookie(request));
    clearRefreshCookie(response, this.config);
  }

  private respond(response: Response, session: AuthSession): AuthResponse {
    setRefreshCookie(response, session.refreshToken, this.config);
    return {
      user: toUserResponse(session.user),
      accessToken: session.accessToken,
      expiresIn: session.expiresIn,
    };
  }
}
