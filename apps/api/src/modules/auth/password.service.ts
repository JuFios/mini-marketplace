import { Injectable, OnModuleInit } from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    // A real hash, with the production parameters, for `verifyAgainstNothing`.
    this.dummyHash = await this.hash(randomBytes(16).toString('hex'));
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      // A malformed stored hash is a failed login, not a server error.
      return false;
    }
  }

  /**
   * Spends the same time as a real verification. Login calls it for an unknown email so that
   * response timing does not reveal which emails are registered.
   */
  async verifyAgainstNothing(password: string): Promise<void> {
    await this.verify(this.dummyHash, password);
  }
}
