{
  description = "cfn-changeset-viewer";

  inputs = {
    flake-parts.url = "github:hercules-ci/flake-parts";
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    process-compose-flake.url = "github:Platonic-Systems/process-compose-flake";
    services-flake.url = "github:juspay/services-flake";
  };
  outputs =
    inputs@{ self, flake-parts, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [
        inputs.process-compose-flake.flakeModule
      ];
      perSystem =
        { self', pkgs, ... }:
        let
          buildNpmPackage = pkgs.buildNpmPackage.override { nodejs = pkgs.nodejs_24; };
        in
        {
          packages = {
            cfn-changeset-viewer = buildNpmPackage {
              pname = "cfn-changeset-viewer";
              version = toString (self.shortRev or self.dirtyShortRev or self.lastModified or "unknown");
              src = ./.;
              npmDepsHash = "sha256-NyWZ+8ArlUCsuBN5wZA9vnuX/3HFtuI42/V1+RIKom0=";
              dontNpmBuild = true;
              meta.mainProgram = "cfn-changeset-viewer";
            };
            default = self'.packages.cfn-changeset-viewer;
          };

          process-compose.dev = {
            imports = [
              inputs.services-flake.processComposeModules.default
              ./nix/dev.nix
            ];
          };

          devShells.default = pkgs.mkShell {
            packages = [ pkgs.awscli2 ];
            inputsFrom = [ self'.packages.default ];
          };
        };
      systems = inputs.nixpkgs.lib.systems.flakeExposed;
    };
}
