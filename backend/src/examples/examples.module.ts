import { Module } from "@nestjs/common";
import { ExamplesController } from "./examples.controller";
import { RolesModule } from "../roles/roles.module";

@Module({
  imports: [RolesModule],
  controllers: [ExamplesController],
})
export class ExamplesModule {}
