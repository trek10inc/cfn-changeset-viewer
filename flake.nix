{
  description = "cfn-changeset-viewer";

  inputs = {
    flake-parts.url = "github:hercules-ci/flake-parts";
    nixpkgs.url = "github:NixOS/nixpkgs/release-24.11";
  };
  outputs =
    inputs@{ self, flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      perSystem =
        { self', pkgs, ... }:
        let
          buildNpmPackage = pkgs.buildNpmPackage.override { nodejs = pkgs.nodejs_20; };
        in
        {
          packages = {
            cfn-changeset-viewer = buildNpmPackage {
              pname = "cfn-changeset-viewer";
              version = toString (self.shortRev or self.dirtyShortRev or self.lastModified or "unknown");
              src = ./.;
              npmDepsHash = "sha256-ICaGtofENMaAjk/KGRn8RgpMAICSttx4AIcbi1HsW8Q=";
              dontNpmBuild = true;
              meta.mainProgram = "cfn-changeset-viewer";
            };
            default = self'.packages.cfn-changeset-viewer;
          };

          devShells.default = pkgs.mkShell {
            packages = [ pkgs.awscli2 ];
            inputsFrom = [ self'.packages.default ];
          };
        };
      systems = inputs.nixpkgs.lib.systems.flakeExposed;
    };
}
