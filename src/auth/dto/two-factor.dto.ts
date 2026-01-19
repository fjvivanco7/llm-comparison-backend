import { IsString, Length, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class VerifyTwoFactorDto {
  @ApiProperty({ example: '123456', description: 'Código de 6 dígitos del autenticador' })
  @IsString()
  @Length(6, 9) // 6 para TOTP, 9 para backup codes (XXXX-XXXX)
  @IsNotEmpty()
  code: string;
}

export class DisableTwoFactorDto {
  @ApiProperty({ example: 'password123', description: 'Contraseña actual' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ example: '123456', description: 'Código 2FA actual' })
  @IsString()
  @Length(6, 9)
  @IsNotEmpty()
  code: string;
}

export class TwoFactorLoginDto {
  @ApiProperty({ example: '123456', description: 'Código 2FA' })
  @IsString()
  @Length(6, 9)
  @IsNotEmpty()
  code: string;

  @ApiProperty({ description: 'Token temporal del primer paso de login' })
  @IsString()
  @IsNotEmpty()
  tempToken: string;
}
