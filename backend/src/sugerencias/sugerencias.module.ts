import { Module } from "@nestjs/common";
import { SugerenciasController } from "./sugerencias.controller";
import { PrismaModule } from "../prisma/prisma.module";

@Module({
  imports: [PrismaModule],
  controllers: [SugerenciasController],
})
export class SugerenciasModule {}
