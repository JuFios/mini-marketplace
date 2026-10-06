import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
import { normalizeEmail } from './register.dto';

export class LoginDto {
  @Transform(normalizeEmail)
  @IsEmail()
  @MaxLength(254)
  email!: string;

  // No complexity rules here (they would reveal the policy to attackers); the length cap only
  // stops absurdly long inputs from being hashed.
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;
}
