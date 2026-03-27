import { Module } from "@nestjs/common";
import { PrismaModule } from "./prisma/prisma.module";
import { EmailModule } from "./email/email.module";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { RolesModule } from "./roles/roles.module";
import { UsersModule } from "./users/users.module";
import { ExamplesModule } from "./examples/examples.module";
import { SugerenciasModule } from "./sugerencias/sugerencias.module";

@Module({
  imports: [
    PrismaModule,
    EmailModule,
    AuditModule,
    AuthModule,
    RolesModule,
    UsersModule,
    ExamplesModule,
    SugerenciasModule,
  ],
})
export class AppModule {}
