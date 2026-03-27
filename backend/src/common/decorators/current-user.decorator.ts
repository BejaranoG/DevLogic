import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedUser } from "../../auth/interfaces/jwt.interface";

/**
 * Extrae el usuario autenticado de request.user.
 *
 * Uso:
 *   @Get('perfil')
 *   @UseGuards(JwtAuthGuard)
 *   getPerfil(@CurrentUser() user: AuthenticatedUser) {
 *     return user;
 *   }
 *
 *   // O extraer solo un campo:
 *   getPerfil(@CurrentUser('email') email: string) {
 *     return email;
 *   }
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user as AuthenticatedUser;

    if (field) {
      return user?.[field];
    }
    return user;
  },
);
