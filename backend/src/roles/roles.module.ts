import { Module } from "@nestjs/common";
import { RolesController } from "./roles.controller";
import { RolesService } from "./roles.service";
import { PermissionsGuard } from "../common/guards/permissions.guard";

@Module({
  controllers: [RolesController],
  providers: [RolesService, PermissionsGuard],
  exports: [RolesService, PermissionsGuard],
})
export class RolesModule {}
