import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserResponse } from './dto/user.response.dto';
import { toUserResponse } from './mappers/to-user-response';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'The authenticated user' })
  async me(@CurrentUser() caller: AuthenticatedUser): Promise<UserResponse> {
    return toUserResponse(await this.users.getProfile(caller.id));
  }
}
