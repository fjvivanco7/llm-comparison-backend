import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '@prisma/client'; // ← AGREGAR

export class AuthResponseDto {
  @ApiProperty({
    description: 'Token JWT de acceso',
  })
  accessToken: string;

  @ApiProperty({
    description: 'Tipo de token',
    example: 'Bearer',
  })
  tokenType: string;

  @ApiProperty({
    description: 'Tiempo de expiración en segundos',
    example: 86400,
  })
  expiresIn: number;

  @ApiProperty({
    description: 'Datos del usuario',
  })
  user: {
    id: number;
    email: string;
    firstName?: string;
    lastName?: string;
    role?: UserRole; // ← AGREGAR
    isEmailVerified: boolean;
  };
}
