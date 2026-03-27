import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { AuditController } from "./audit.controller";
import { PermissionsGuard } from "../common/guards/permissions.guard";

@Global()
@Module({
  controllers: [AuditController],
  providers: [AuditService, PermissionsGuard], // Provide guard directly, no circular import
  exports: [AuditService],
})
export class AuditModule {}
