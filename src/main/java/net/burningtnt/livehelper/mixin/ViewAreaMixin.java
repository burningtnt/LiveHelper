package net.burningtnt.livehelper.mixin;

import net.minecraft.client.renderer.LevelRenderer;
import net.minecraft.client.renderer.ViewArea;
import net.minecraft.client.renderer.chunk.SectionRenderDispatcher;
import net.minecraft.core.SectionPos;
import net.minecraft.world.level.Level;
import org.spongepowered.asm.mixin.Final;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.Overwrite;
import org.spongepowered.asm.mixin.Shadow;

@Mixin(ViewArea.class)
public abstract class ViewAreaMixin {
    @Shadow
    protected int sectionGridSizeX;

    @Shadow
    protected int sectionGridSizeY;

    @Shadow
    protected int sectionGridSizeZ;

    @Shadow
    public SectionRenderDispatcher.RenderSection[] sections;

    @Shadow
    private SectionPos cameraSectionPos;

    @Shadow
    private int viewDistance;
    @Shadow
    @Final
    protected Level level;

    @Shadow
    protected abstract int getSectionIndex(int x, int y, int z);

    @Shadow
    @Final
    protected LevelRenderer levelRenderer;

    /**
     * @author Burning_TNT
     * @reason Improve performance
     */
    @Overwrite
    public void repositionCamera(SectionPos cameraSectionPos) {
        int lowestX = cameraSectionPos.x() - this.viewDistance;
        int lowestZ = cameraSectionPos.z() - this.viewDistance;
        int minSectionY = this.level.getMinSectionY();

        for (int gridX = 0; gridX < this.sectionGridSizeX; gridX++) {
            int newSectionX = lowestX + Math.floorMod(gridX - lowestX, this.sectionGridSizeX);

            for (int gridZ = 0; gridZ < this.sectionGridSizeZ; gridZ++) {
                int newSectionZ = lowestZ + Math.floorMod(gridZ - lowestZ, this.sectionGridSizeZ);

                SectionRenderDispatcher.RenderSection first = this.sections[this.getSectionIndex(gridX, 0, gridZ)];
                long bottomSectionPos = SectionPos.asLong(newSectionX, minSectionY, newSectionZ);
                if (first.getSectionNode() != bottomSectionPos) {
                    first.setSectionNode(bottomSectionPos);

                    for (int gridY = 1; gridY < this.sectionGridSizeY; gridY++) {
                        int newSectionY = minSectionY + gridY;
                        this.sections[this.getSectionIndex(gridX, gridY, gridZ)]
                                .setSectionNode(SectionPos.asLong(newSectionX, newSectionY, newSectionZ));
                    }
                }
            }
        }

        this.cameraSectionPos = cameraSectionPos;
        this.levelRenderer.getSectionOcclusionGraph().invalidate();
    }
}
